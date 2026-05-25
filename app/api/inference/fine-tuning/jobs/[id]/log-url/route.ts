/**
 * GET /api/inference/fine-tuning/jobs/[id]/log-url
 *
 * Returns a short-lived presigned HTTPS URL for the training log stored at
 * r2://ahura-ft-adapters/.../training.log. The dashboard hits this when the
 * user clicks "download log ↗" — opening r2:// in a browser doesn't work,
 * and the R2 bucket isn't public, so we sign-on-demand.
 *
 * Expiry is short (1 hour) — users will re-request if they need it later.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";

const URL_TTL_SECONDS = 3600;

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/** Parse "r2://bucket/key/path" → { bucket, key }. */
function parseR2Url(url: string): { bucket: string; key: string } | null {
  if (!url.startsWith("r2://") && !url.startsWith("s3://")) return null;
  const rest = url.replace(/^(r2|s3):\/\//, "");
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-ft-log-url",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

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
    return NextResponse.json(
      { error: `Invalid log URL scheme: ${data.training_log_url}` },
      { status: 500 }
    );
  }

  // R2 speaks the S3 API; AWS SDK works out of the box with the R2 endpoint.
  const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }),
      { expiresIn: URL_TTL_SECONDS }
    );
    return NextResponse.json({ success: true, url, expires_in: URL_TTL_SECONDS });
  } catch (err) {
    console.error("[FT log-url] sign failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign URL" },
      { status: 500 }
    );
  }
}
