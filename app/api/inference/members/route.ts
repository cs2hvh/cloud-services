/**
 * GET /api/inference/members
 *
 * List members of the caller's active inference org with role + email + joined date.
 *
 * Phase 1 scope: list only. Invite flow + role change + remove ship via the
 * /[id] route. Full email-based invite (with token + accept page) is Phase 7.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

interface MemberRow {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "developer" | "viewer";
  status: "active" | "invited" | "suspended";
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
}

interface AuthUser {
  id: string;
  email?: string | null;
  raw_user_meta_data?: Record<string, unknown> | null;
  created_at?: string;
}

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-members",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: members, error } = await supabase
    .schema("inference")
    .from("org_members")
    .select("id, user_id, role, status, invited_at, joined_at, created_at")
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: true })
    .returns<MemberRow[]>();

  if (error) {
    console.error("[Inference Members] list error:", error);
    return NextResponse.json({ error: "Failed to list members" }, { status: 500 });
  }

  // Hydrate user emails / metadata from auth.users in a single batch
  const userIds = (members ?? []).map((m) => m.user_id);
  const userMap = new Map<string, AuthUser>();
  if (userIds.length > 0) {
    // listUsers paginated; for Phase 1 fetch first 1000 (way more than any org will have soon)
    const { data: usersData, error: usersErr } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!usersErr && usersData) {
      for (const u of usersData.users) {
        if (userIds.includes(u.id)) {
          userMap.set(u.id, {
            id: u.id,
            email: u.email,
            raw_user_meta_data: u.user_metadata as Record<string, unknown> | null,
            created_at: u.created_at,
          });
        }
      }
    }
  }

  const counts = {
    total: members?.length ?? 0,
    owners: members?.filter((m) => m.role === "owner").length ?? 0,
    admins: members?.filter((m) => m.role === "admin").length ?? 0,
    developers: members?.filter((m) => m.role === "developer").length ?? 0,
    viewers: members?.filter((m) => m.role === "viewer").length ?? 0,
    invited: members?.filter((m) => m.status === "invited").length ?? 0,
  };

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name, your_role: org.role },
    counts,
    data: (members ?? []).map((m) => {
      const u = userMap.get(m.user_id);
      const meta = (u?.raw_user_meta_data ?? {}) as Record<string, unknown>;
      const fullName = typeof meta.full_name === "string" ? meta.full_name : null;
      return {
        id: m.id,
        user_id: m.user_id,
        email: u?.email ?? null,
        full_name: fullName,
        role: m.role,
        status: m.status,
        invited_at: m.invited_at,
        joined_at: m.joined_at,
        is_you: m.user_id === auth.userId,
      };
    }),
  });
}
