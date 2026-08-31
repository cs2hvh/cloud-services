/**
 * GET /api/v2/me
 *
 * Who the caller is, and the account their resources belong to. Called first by
 * every dashboard page.
 *
 * IT BOOTSTRAPS. A brand-new account could previously do NOTHING: `paas.teams`
 * has no INSERT policy, `paas.team_members` requires you to already be an admin
 * of the team you are joining, and `paas.projects` requires membership. Every
 * path to a first team needed a team you were already in, so signing up produced
 * an account that could not create anything. It went unnoticed only because
 * every project so far was seeded by SQL.
 *
 * `paas.bootstrap_personal_team()` is the one operation that cannot be expressed
 * under RLS. It is SECURITY DEFINER and therefore the dangerous kind, so: it
 * takes NO arguments and acts on `auth.uid()` alone, it is idempotent, and its
 * search_path is pinned. A user-id parameter would let any caller bootstrap a
 * team for any user, which is the exact class of bug this project keeps finding.
 *
 * ON THE ACCOUNT MODEL: a "team" here is the container that owns projects, not a
 * seat to be billed for. Billing is on-demand against credits, the way Linode
 * and DigitalOcean work — usage draws down a balance. One team per person is the
 * default and nothing in the product asks the user to think about it.
 */

import { createClient } from "@/lib/supabase/server";
import { json, unauthenticated, apiError } from "../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  // Returns the existing team when there is one, so this is a no-op for
  // everyone except a genuinely new account.
  const { data: team, error } = await supabase.schema("paas").rpc("bootstrap_personal_team").single();

  if (error) {
    // Logged, not swallowed. A 500 with no server-side trace is a bug report
    // with the evidence removed — and this is the first call every dashboard
    // page makes, so a silent failure here looks like "the product is broken"
    // with nothing to go on.
    console.error("[v2/me] bootstrap_personal_team failed:", JSON.stringify(error));
    // Never fall through to "no account". A failed bootstrap that renders as an
    // empty dashboard invites the user to create a second account, and the
    // first one still owns their apps.
    return apiError("internal", "Could not load your account. Nothing has been changed.", 500);
  }

  const t = team as { ref: string; slug: string; name: string } | null;
  if (!t) {
    return apiError("internal", "Account lookup returned nothing. Nothing has been changed.", 500);
  }

  return json({
    user: { id: user.id, email: user.email ?? null },
    team: { ref: t.ref, slug: t.slug, name: t.name },
  });
}
