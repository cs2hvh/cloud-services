/**
 * PATCH  /api/inference/members/[id] — change role (owner/admin only)
 * DELETE /api/inference/members/[id] — remove member (owner/admin only;
 *                                       cannot remove the org owner)
 *
 * Phase 1: simple inline role/remove from the members page.
 * Phase 7: invite flow with email tokens + accept page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "developer", "viewer"]),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-member-patch",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can change member roles" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Only owners can promote others to owner (admins can't grant owner)
  if (parsed.data.role === "owner" && org.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can grant the owner role" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("org_members")
    .update({ role: parsed.data.role })
    .eq("id", id)
    .eq("org_id", org.org_id)
    .select("id, user_id, role, status")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Member not found in this org" },
      { status: 404 }
    );
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "member.role_changed",
    targetType: "org_member",
    targetId: id,
    metadata: { target_user_id: data.user_id, new_role: parsed.data.role },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid member id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-member-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can remove members" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Fetch the target member to check it isn't the org owner
  const { data: target } = await supabase
    .schema("inference")
    .from("org_members")
    .select("id, role, user_id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; role: string; user_id: string }>();

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { error: "Cannot remove the org owner. Transfer ownership first." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .schema("inference")
    .from("org_members")
    .delete()
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[Inference Members] delete error:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "member.removed",
    targetType: "org_member",
    targetId: id,
    metadata: { target_user_id: target.user_id, previous_role: target.role },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, removed_id: id });
}
