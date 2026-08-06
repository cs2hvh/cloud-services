/**
 * GET /api/inference/fine-tuning/jobs/[id]/log-url
 *
 * Returns the training log stored at r2://ahura-ft-adapters/.../training.log
 * — scrubbed, not a raw presigned URL to the object.
 *
 * Found live (2026-07-17, Phase-0 billing audit): this used to mint a
 * presigned URL straight to the RAW log — train.sh (infra/runpod/training-
 * images/axolotl/train.sh) tees axolotl's real stdout to it verbatim, so
 * every RunPod/kubectl/internal-path mention in a training run's own output
 * would go to the customer completely unscrubbed. Fixed by fetching the
 * object server-side and running it through stripInfraIdentifiers()
 * (lib/inference/error-messages.ts) before it ever leaves this route — no
 * raw copy of the log is ever handed to a caller. (No live UI caller of this
 * route existed yet, so this is a contract change with zero blast radius,
 * not a breaking one.)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { stripInfraIdentifiers } from "@/lib/inference/error-messages";

// A training log can run long on a multi-epoch job; cap what we'll ever
// buffer/return so a huge log can't blow up this route's memory or response
// size — same "never inline unbounded" discipline as agent-runner's sandbox
// output cap (MAX_OUTPUT_CHARS in workers/agent-runner/src/tools/code.ts).
const MAX_LOG_CHARS = 2_000_000; // ~2MB of text

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/** Allow-list of buckets we'll mint signed URLs against. Without this an
 *  attacker who could inject a row could trick us into signing arbitrary
 *  paths inside any bucket our R2 creds reach. Defense-in-depth: even
 *  though row writes are gated by HMAC + service-role, this caps blast
 *  radius if a future bug lets through unsanitized URLs. */
const ALLOWED_LOG_BUCKETS = new Set(["ahura-ft-adapters"]);

/** Parse "r2://bucket/key/path" → { bucket, key }. */
function parseR2Url(url: string): { bucket: string; key: string } | null {
  if (!url.startsWith("r2://") && !url.startsWith("s3://")) return null;
  const rest = url.replace(/^(r2|s3):\/\//, "");
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  // No path traversal — keys with .. or // are suspicious; reject.
  if (key.includes("..") || key.startsWith("/") || key.includes("//")) return null;
  return { bucket, key };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-ft-log-url",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("training_log_url, org_id")
    .eq("id", id)
    .maybeSingle<{ training_log_url: string | null; org_id: string }>();

  if (!data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (data.org_id !== org.org_id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!data.training_log_url) {
    return NextResponse.json({ error: "No log uploaded for this job" }, { status: 404 });
  }

  const parsed = parseR2Url(data.training_log_url);
  if (!parsed) {
    // Don't echo the URL back to the user — could leak internal paths.
    console.error("[FT log-url] unparseable URL for job", id);
    return NextResponse.json({ error: "Log URL is malformed" }, { status: 500 });
  }
  if (!ALLOWED_LOG_BUCKETS.has(parsed.bucket)) {
    console.error("[FT log-url] bucket not in allow-list:", parsed.bucket);
    return NextResponse.json({ error: "Log URL bucket not permitted" }, { status: 403 });
  }
  // Lock key prefix to <org_id>/<job_id>/ — prevents signing URLs that
  // belong to OTHER orgs' adapters even if a row got cross-contaminated.
  const expectedPrefix = `${data.org_id}/${id}/`;
  if (!parsed.key.startsWith(expectedPrefix)) {
    console.error("[FT log-url] key prefix mismatch:", parsed.key, "expected", expectedPrefix);
    return NextResponse.json({ error: "Log URL path is not authorized" }, { status: 403 });
  }

  // R2 speaks the S3 API; AWS SDK works out of the box with the R2 endpoint.
  // Guard against missing creds — SDK v3 throws an opaque "Resolved
  // credential object is not valid" if either field is empty/undefined.
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    console.error("[FT log-url] missing R2 env:", {
      hasKey: !!accessKeyId,
      hasSecret: !!secretAccessKey,
      hasEndpoint: !!endpoint,
    });
    return NextResponse.json(
      { error: "Log download is not configured on this server" },
      { status: 500 }
    );
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    const raw = await obj.Body?.transformToString("utf-8");
    if (raw == null) {
      return NextResponse.json({ error: "Log object was empty or unreadable" }, { status: 500 });
    }

    const truncated = raw.length > MAX_LOG_CHARS;
    const body = truncated ? raw.slice(0, MAX_LOG_CHARS) : raw;
    const log = stripInfraIdentifiers(body) + (truncated ? "\n\n…(log truncated)" : "");

    return NextResponse.json({ success: true, log, truncated });
  } catch (err) {
    console.error("[FT log-url] fetch failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch log" },
      { status: 500 }
    );
  }
}
