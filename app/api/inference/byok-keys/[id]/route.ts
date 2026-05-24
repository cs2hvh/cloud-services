/**
 * DELETE /api/inference/byok-keys/[id]
 *
 * Removes a BYOK key from the user's active inference org.
 * Only an admin/owner of the org can remove (enforced via RLS policy
 * api_keys_admin_all + by passing the user's JWT to supabase-js).
 *
 * Since we use service-role for the actual DELETE (RLS would block
 * non-owners), we do the membership check explicitly in app code first.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid BYOK key id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-byok-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) {
    return NextResponse.json({ error: "No inference org" }, { status: 404 });
  }
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can delete BYOK keys" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error, count } = await supabase
    .schema("inference")
    .from("byok_keys")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[Inference BYOK] delete failed:", error);
    return NextResponse.json(
      { error: "Failed to delete BYOK key" },
      { status: 500 }
    );
  }
  if (!count) {
    return NextResponse.json(
      { error: "BYOK key not found in this org" },
      { status: 404 }
    );
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "byok.removed",
    targetType: "byok_key",
    targetId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, deleted_id: id });
}
