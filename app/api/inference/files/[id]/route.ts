/**
 * GET    /api/inference/files/[id]    — metadata
 * DELETE /api/inference/files/[id]    — soft-delete (deleted_at) + R2 purge
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { deleteObject } from "@/lib/inference/batch-storage";

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
    .select("id, purpose, filename, bytes, produced_by_batch_id, created_at, deleted_at")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{
      id: string;
      purpose: string;
      filename: string;
      bytes: number;
      produced_by_batch_id: string | null;
      created_at: string;
      deleted_at: string | null;
    }>();

  if (!data || data.deleted_at) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    object: "file",
    purpose: data.purpose,
    filename: data.filename,
    bytes: Number(data.bytes),
    created_at: Math.floor(new Date(data.created_at).getTime() / 1000),
    produced_by_batch_id: data.produced_by_batch_id,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id } = await params;
  if (!isFileId(id)) return NextResponse.json({ error: "Invalid file id" }, { status: 400 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot delete files" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Need the row first so we know it belongs to this org BEFORE we purge.
  const { data: existing } = await supabase
    .schema("inference")
    .from("files")
    .select("id, filename, purpose, deleted_at")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; filename: string; purpose: string; deleted_at: string | null }>();

  if (!existing || existing.deleted_at) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Soft-delete the row first; purge R2 second. If R2 purge fails the row
  // is already gone — that's acceptable (orphan R2 objects are recovered
  // by a periodic cleanup job, not a correctness problem).
  await supabase
    .schema("inference")
    .from("files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", org.org_id);

  try {
    await deleteObject(org.org_id, id);
  } catch (err) {
    // Log but don't fail the DELETE — the row is already marked deleted
    // and a separate cleanup will catch the orphan.
    console.warn("[Inference Files] R2 purge failed (orphan left):", err);
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "file.deleted",
    targetType: "file",
    targetId: id,
    metadata: { filename: existing.filename, purpose: existing.purpose },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ id, object: "file", deleted: true });
}
