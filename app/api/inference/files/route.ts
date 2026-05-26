/**
 * GET  /api/inference/files       — list files in the active org
 * POST /api/inference/files       — upload a new file (JSONL body)
 *
 * OpenAI-compatible shape for the batch endpoint. Bytes live in R2;
 * this row is just metadata. Two upload modes:
 *
 *   1. multipart/form-data  — { file: <File>, purpose: "batch" }
 *      (the OpenAI Node SDK uses this shape)
 *
 *   2. application/x-ndjson — raw JSONL body, ?purpose=batch in query
 *      (curl-friendly path)
 *
 * Both routes write the row + R2 object atomically: row insert FIRST,
 * then R2 upload. On R2 failure we DELETE the row before responding so
 * we never leak orphan rows pointing at non-existent keys.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { uploadBytes, BATCH_BUCKET, fileKey, deleteObject } from "@/lib/inference/batch-storage";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

const PURPOSE_VALUES = ["batch"] as const;
const MAX_BYTES = 200 * 1024 * 1024; // 200MB — matches OpenAI's limit

function makeFileId(): string {
  return `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

const purposeQuerySchema = z.object({
  purpose: z.enum(PURPOSE_VALUES).default("batch"),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-files-list",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const url = new URL(request.url);
  const purposeFilter = url.searchParams.get("purpose");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let q = supabase
    .schema("inference")
    .from("files")
    .select("id, purpose, filename, bytes, produced_by_batch_id, created_at")
    .eq("org_id", org.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (purposeFilter) q = q.eq("purpose", purposeFilter);

  const { data, error } = await q;
  if (error) {
    console.error("[Inference Files] list error:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }

  // OpenAI shape: { object: "list", data: [...] }
  return NextResponse.json({
    object: "list",
    data: (data ?? []).map((f) => ({
      id: f.id,
      object: "file",
      purpose: f.purpose,
      filename: f.filename,
      bytes: Number(f.bytes),
      created_at: Math.floor(new Date(f.created_at).getTime() / 1000),
      produced_by_batch_id: f.produced_by_batch_id ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-files-upload",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot upload files" }, { status: 403 });
  }

  // Determine purpose + extract bytes from either multipart or raw body
  const contentType = request.headers.get("content-type") ?? "";
  let purpose: (typeof PURPOSE_VALUES)[number] = "batch";
  let filename = "upload.jsonl";
  let body: Buffer;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Missing `file` field in multipart body" }, { status: 400 });
      }
      const purposeFromForm = form.get("purpose");
      const parsed = purposeQuerySchema.safeParse({
        purpose: typeof purposeFromForm === "string" ? purposeFromForm : undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
      }
      purpose = parsed.data.purpose;
      filename = (file as File).name || "upload.jsonl";
      body = Buffer.from(await (file as File).arrayBuffer());
    } else {
      // Raw body upload — purpose via query string
      const url = new URL(request.url);
      const parsed = purposeQuerySchema.safeParse({
        purpose: url.searchParams.get("purpose") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
      }
      purpose = parsed.data.purpose;
      filename = url.searchParams.get("filename") || "upload.jsonl";
      const buf = await request.arrayBuffer();
      body = Buffer.from(buf);
    }
  } catch (err) {
    console.error("[Inference Files] body parse failed:", err);
    return NextResponse.json({ error: "Failed to read upload body" }, { status: 400 });
  }

  if (body.length === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (body.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` },
      { status: 413 }
    );
  }

  // Reject non-batch purposes for now (forward-compat enum has more values)
  if (purpose !== "batch") {
    return NextResponse.json(
      { error: `purpose must be "batch" (got "${purpose}")` },
      { status: 400 }
    );
  }

  const fileId = makeFileId();
  const key = fileKey(org.org_id, fileId);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1. Insert metadata row first (so RLS + uniqueness checks fire BEFORE
  //    we burn an R2 PUT). Bytes-known-at-insert means the dashboard can
  //    show progress without re-stat'ing R2.
  const { error: insertErr } = await supabase
    .schema("inference")
    .from("files")
    .insert({
      id: fileId,
      org_id: org.org_id,
      created_by: auth.user!.id,
      purpose,
      filename,
      bytes: body.length,
      r2_bucket: BATCH_BUCKET,
      r2_key: key,
    });

  if (insertErr) {
    console.error("[Inference Files] insert error:", insertErr);
    return NextResponse.json({ error: "Failed to register file" }, { status: 500 });
  }

  // 2. Upload to R2. On failure, delete the row so we don't leak orphans.
  try {
    await uploadBytes(org.org_id, fileId, body);
  } catch (err) {
    console.error("[Inference Files] R2 upload failed:", err);
    await supabase.schema("inference").from("files").delete().eq("id", fileId);
    return NextResponse.json(
      {
        error:
          customerSafeErrorMessage(err instanceof Error ? err.message : "Upload failed") ||
          "Upload to object storage failed. Please retry.",
      },
      { status: 502 }
    );
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "file.uploaded",
    targetType: "file",
    targetId: fileId,
    metadata: { purpose, bytes: body.length, filename },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // OpenAI-compatible response shape
  return NextResponse.json(
    {
      id: fileId,
      object: "file",
      purpose,
      filename,
      bytes: body.length,
      created_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 }
  );
}

// Keep delete import lint-happy until used (extracted to keep file focused)
void deleteObject;
