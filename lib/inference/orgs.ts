/**
 * Helper to resolve the "active" inference org for an authenticated user.
 *
 * Phase 1: every user has exactly one personal org (auto-bootstrapped on
 * first inference signup via inference.bootstrap_personal_org). Picking
 * the first active membership is correct.
 *
 * Phase 1+ (org switcher): the dashboard will set a cookie naming the
 * selected org, and this helper will honor that cookie. Until then, the
 * "first joined" personal org is the implicit active org.
 */
import { createClient } from "@supabase/supabase-js";

interface OrgInfo {
  org_id: string;
  org_slug: string;
  org_name: string;
  role: "owner" | "admin" | "developer" | "viewer";
  zdr_default: boolean;
}

export async function getActiveOrgForUser(userId: string): Promise<OrgInfo | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Look up the user's first active membership + the org metadata in one call.
  const { data, error } = await supabase
    .schema("inference")
    .from("org_members")
    .select("role, orgs!inner(id, slug, name, zdr_default, deleted_at)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle<{
      role: OrgInfo["role"];
      orgs: {
        id: string;
        slug: string;
        name: string;
        zdr_default: boolean;
        deleted_at: string | null;
      };
    }>();

  if (error || !data || data.orgs.deleted_at) return null;

  return {
    org_id: data.orgs.id,
    org_slug: data.orgs.slug,
    org_name: data.orgs.name,
    role: data.role,
    zdr_default: data.orgs.zdr_default,
  };
}

/**
 * If no org exists for the user (first-time visitor to /services/inference
 * after signing up before inference launched), bootstrap one. Idempotent.
 */
export async function getOrBootstrapOrgForUser(
  userId: string,
  email: string
): Promise<OrgInfo> {
  const existing = await getActiveOrgForUser(userId);
  if (existing) return existing;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase
    .schema("inference")
    .rpc("bootstrap_personal_org", { p_user_id: userId, p_email: email });

  if (error) {
    throw new Error(`Failed to bootstrap inference org: ${error.message}`);
  }

  const bootstrapped = await getActiveOrgForUser(userId);
  if (!bootstrapped) {
    throw new Error("Bootstrap succeeded but org lookup returned null");
  }
  return bootstrapped;
}
