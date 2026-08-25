/**
 * GET /api/inference/fine-tuning/jobs/[id]/adapter-url
 *
 * Returns a short-lived presigned HTTPS URL for the adapter tarball at
 * r2://ahura-ft-adapters/<org>/<job>/adapter.tar.gz. The dashboard hits
 * this when the user clicks "Generate serve command" — the URL is
 * embedded directly in the docker run command so the user doesn't need
 * any R2 credentials.
 *
 * Mirrors /log-url shape for consistency. 6-hour TTL covers the common
 * flow of copy-command → rent-pod → ssh → docker pull (which itself can
 * take 5-10 min) → run, without forcing the user to refresh halfway.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

const URL_TTL_SECONDS = 6 * 3600;
const ADAPTER_FILENAME = "adapter.tar.gz";
const ALLOWED_BUCKETS = new Set(["ahura-ft-adapters"]);

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/** Parse "r2://bucket/key/path/" → { bucket, prefix }. */
function parseR2Prefix(url: string): { bucket: string; prefix: string } | null {
  if (!url.startsWith("r2://") && !url.startsWith("s3://")) return null;
  const rest = url.replace(/^(r2|s3):\/\//, "");
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  // The output_artifact_url stored on finetunes rows ends with "/" — preserve
  // that semantics; the adapter file key is <prefix>adapter.tar.gz.
  const prefix = rest.slice(slash + 1);
  if (prefix.includes("..") || prefix.startsWith("/") || prefix.includes("//")) return null;
  return { bucket, prefix };
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
    prefix: "rl:inf-ft-adapter-url",
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
    .select("output_artifact_url, org_id, status")
    .eq("id", id)
    .maybeSingle<{ output_artifact_url: string | null; org_id: string; status: string }>();

  if (!data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (data.org_id !== org.org_id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (data.status !== "completed") {
    return NextResponse.json(
      { error: "Job is not yet completed; adapter not available" },
      { status: 400 }
    );
  }
  if (!data.output_artifact_url) {
    return NextResponse.json(
      { error: "No adapter recorded for this job" },
      { status: 404 }
    );
  }

  const parsed = parseR2Prefix(data.output_artifact_url);
  if (!parsed) {
    console.error("[FT adapter-url] unparseable URL for job", id);
    return NextResponse.json({ error: "Adapter URL is malformed" }, { status: 500 });
  }
  if (!ALLOWED_BUCKETS.has(parsed.bucket)) {
    console.error("[FT adapter-url] bucket not in allow-list:", parsed.bucket);
    return NextResponse.json({ error: "Adapter bucket not permitted" }, { status: 403 });
  }
  const expectedPrefix = `${data.org_id}/${id}/`;
  if (!parsed.prefix.startsWith(expectedPrefix)) {
    console.error("[FT adapter-url] prefix mismatch:", parsed.prefix, "expected", expectedPrefix);
    return NextResponse.json({ error: "Adapter path is not authorized" }, { status: 403 });
  }

  // R2 speaks S3. Guard against missing/empty creds — SDK v3 throws
  // an opaque "Resolved credential object is not valid" otherwise.
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    console.error("[FT adapter-url] missing R2 env:", {
      hasKey: !!accessKeyId,
      hasSecret: !!secretAccessKey,
      hasEndpoint: !!endpoint,
    });
    return NextResponse.json(
      { error: "Adapter download is not configured on this server" },
      { status: 500 }
    );
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const key = `${parsed.prefix}${ADAPTER_FILENAME}`;
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: parsed.bucket, Key: key }),
      { expiresIn: URL_TTL_SECONDS }
    );
    return NextResponse.json({ success: true, url, expires_in: URL_TTL_SECONDS });
  } catch (err) {
    console.error("[FT adapter-url] sign failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign adapter URL" },
      { status: 500 }
    );
  }
}
