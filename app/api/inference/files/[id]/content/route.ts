/**
 * GET /api/inference/files/[id]/content
 *
 * Returns the raw bytes of the file. For batch output/error files this is
 * how users download results. Two response shapes based on the Accept
 * header:
 *
 *   - Accept: application/x-ndjson (default)   stream bytes inline
 *   - Accept: application/json                 { url } presigned R2 link
 *                                              (lets large files bypass
 *                                              our server entirely)
 *
 * The OpenAI Node SDK does inline-stream; presigned URL is for the dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { downloadText, presignDownload } from "@/lib/inference/batch-storage";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

function isFileId(s: string): boolean {
  return /^file_[a-z0-9]+$/i.test(s);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id } = await params;
  if (!isFileId(id)) return NextResponse.json({ error: "Invalid file id" }, { status: 400 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("files")
    .select("id, filename, deleted_at")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; filename: string; deleted_at: string | null }>();

  if (!data || data.deleted_at) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") && !accept.includes("application/x-ndjson")) {
    // Presigned URL path — dashboard friendly, bypasses our server for the bytes.
    try {
      const url = await presignDownload(org.org_id, id);
      return NextResponse.json({ url, expires_in: 6 * 3600 });
    } catch (err) {
      console.error("[Inference Files] presign failed:", err);
      return NextResponse.json({ error: "Failed to sign download URL" }, { status: 500 });
    }
  }

  // Inline stream (OpenAI SDK path)
  try {
    const text = await downloadText(org.org_id, id);
    return new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "content-disposition": `attachment; filename="${data.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    console.error("[Inference Files] R2 download failed:", err);
    return NextResponse.json(
      {
        error:
          customerSafeErrorMessage(err instanceof Error ? err.message : "Download failed") ||
          "Could not retrieve file from object storage. Please retry.",
      },
      { status: 502 }
    );
  }
}
