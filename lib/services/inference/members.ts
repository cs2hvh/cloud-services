import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };
type Role = "owner" | "admin" | "developer" | "viewer";

export const InferenceMemberService = {
  async list(orgId: string, currentUserId: string): Promise<SR<{ counts: Record<string, number>; data: unknown[] }>> {
    const db = await createServiceClient();
    const { data: members, error } = await db
      .schema("inference")
      .from("org_members")
      .select("id, user_id, role, status, invited_at, joined_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: "Failed to list members" };

    // Join auth.users for email + display name — reuse same service client
    const userIds = (members ?? []).map((m) => m.user_id);
    let userMap: Record<string, { email?: string; full_name?: string | null }> = {};
    if (userIds.length > 0) {
      try {
        const { data: users } = await db.auth.admin.listUsers();
        userMap = Object.fromEntries(
          (users?.users ?? [])
            .filter((u) => userIds.includes(u.id))
            .map((u) => {
              const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
              return [u.id, { email: u.email, full_name: typeof meta.full_name === "string" ? meta.full_name : null }];
            })
        );
      } catch { /* best-effort */ }
    }

    const counts = {
      total: members?.length ?? 0,
      owners: members?.filter((m) => m.role === "owner").length ?? 0,
      admins: members?.filter((m) => m.role === "admin").length ?? 0,
      developers: members?.filter((m) => m.role === "developer").length ?? 0,
      viewers: members?.filter((m) => m.role === "viewer").length ?? 0,
      invited: members?.filter((m) => m.status === "invited").length ?? 0,
    };

    return {
      success: true,
      data: {
        counts,
        data: (members ?? []).map((m) => ({
          id: m.id,
          user_id: m.user_id,
          email: userMap[m.user_id]?.email ?? null,
          full_name: userMap[m.user_id]?.full_name ?? null,
          role: m.role,
          status: m.status,
          invited_at: m.invited_at,
          joined_at: m.joined_at,
          is_you: m.user_id === currentUserId,
        })),
      },
    };
  },

  async updateRole(
    orgId: string, memberId: string, userId: string,
    actorRole: Role,
    newRole: Role,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data: member } = await db.schema("inference").from("org_members").select("id, user_id, role").eq("id", memberId).eq("org_id", orgId).maybeSingle<{ id: string; user_id: string; role: string }>();
    if (!member) return { success: false, error: "Member not found", status: 404 };

    if (newRole === "owner" && actorRole !== "owner") {
      return { success: false, error: "Only owners can grant the owner role", status: 403 };
    }

    // Cannot demote the org owner
    if (member.role === "owner" && newRole !== "owner") {
      return { success: false, error: "Cannot change the role of the org owner", status: 403 };
    }

    const { data, error } = await db.schema("inference").from("org_members").update({ role: newRole }).eq("id", memberId).select("id, user_id, role, status").single();
    if (error || !data) return { success: false, error: "Failed to update member role" };

    void recordAudit({ orgId, actorUserId: userId, action: "member.role_changed", targetType: "org_member", targetId: memberId, metadata: { from: member.role, to: newRole }, ...audit });
    return { success: true, data };
  },

  async remove(
    orgId: string, memberId: string, userId: string,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<{ removed_id: string }>> {
    const db = await createServiceClient();
    const { data: member } = await db.schema("inference").from("org_members").select("id, user_id, role").eq("id", memberId).eq("org_id", orgId).maybeSingle<{ id: string; user_id: string; role: string }>();
    if (!member) return { success: false, error: "Member not found", status: 404 };
    if (member.role === "owner") return { success: false, error: "Cannot remove the org owner", status: 403 };
    if (member.user_id === userId) return { success: false, error: "Cannot remove yourself", status: 403 };

    const { error } = await db.schema("inference").from("org_members").delete().eq("id", memberId);
    if (error) return { success: false, error: "Failed to remove member" };

    void recordAudit({ orgId, actorUserId: userId, action: "member.removed", targetType: "org_member", targetId: memberId, ...audit });
    return { success: true, data: { removed_id: memberId } };
  },
};
