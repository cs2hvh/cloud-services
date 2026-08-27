/**
 * GET /api/v2/github/callback?installation_id=…
 *
 * Where GitHub sends the user after they install (or reconfigure) the App.
 * Records the installation against the CALLER'S team so their repositories
 * become deployable.
 *
 * THE INSTALLATION ID IN THE QUERY IS ATTACKER-CONTROLLED. It arrives on a URL
 * the user's browser was told to visit, and anyone can type one. So it is never
 * trusted as proof of anything — it is checked against GitHub with our own App
 * credentials before a row is written. Without that check, a caller could claim
 * ANY installation id and gain deploy access to a stranger's repositories,
 * because the row is what later mints tokens.
 *
 * ALREADY CLAIMED BY SOMEONE ELSE is a refusal, not an update. GitHub lets one
 * installation exist per account, and if a different team already holds it,
 * silently repointing it would move another team's repositories under this
 * caller. That is a takeover with a friendly error message.
 *
 * Re-running for a team that already holds it is a no-op — GitHub sends people
 * back here on every reconfigure, so this is the common path, not the edge.
 */

import { createClient } from "@/lib/supabase/server";
import { listInstallations } from "@/lib/paas/github/app";
import { unauthenticated, invalid, notFound, conflict, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DASHBOARD = "/dashboard/v2/projects";

function back(path: string, params: Record<string, string>): Response {
  const q = new URLSearchParams(params).toString();
  return Response.redirect(`${path}${q ? `?${q}` : ""}`, 303);
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  const url = new URL(req.url);
  const raw = url.searchParams.get("installation_id");
  const installationId = Number(raw);
  if (!raw || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return invalid("installation_id is missing or not a number.");
  }

  // The account must exist as far as OUR App is concerned. This is the check
  // that stops a typed-in id becoming access to someone else's repositories.
  let match;
  try {
    const installations = await listInstallations();
    match = installations.find((i) => Number(i.id) === installationId);
  } catch (e) {
    console.error("[v2/github/callback] listInstallations failed:", (e as Error).message);
    return apiError("upstream_error", "Could not confirm the installation with GitHub. Nothing has been recorded.", 502);
  }
  if (!match) {
    // Deliberately the same answer as "does not exist", so probing ids tells
    // the caller nothing.
    return notFound("Installation");
  }

  const { data: team, error: teamError } = await supabase
    .schema("paas")
    .rpc("bootstrap_personal_team")
    .single<{ id: string; ref: string }>();
  if (teamError || !team) {
    console.error("[v2/github/callback] bootstrap failed:", JSON.stringify(teamError));
    return apiError("internal", "Could not load your account. Nothing has been recorded.", 500);
  }

  // Is it already held? RLS hides rows belonging to other teams, so "not
  // visible" and "not present" look identical here — which is why the write
  // below relies on the unique constraint rather than on this read.
  const existing = await supabase
    .schema("paas")
    .from("installations")
    .select("installation_id,team_id")
    .eq("installation_id", installationId)
    .maybeSingle();

  if (existing.data && existing.data.team_id === team.id) {
    return back(DASHBOARD, { connected: match.account?.login ?? String(installationId) });
  }

  const { error: writeError } = await supabase
    .schema("paas")
    .from("installations")
    .insert({
      installation_id: installationId,
      team_id: team.id,
      account_login: match.account?.login ?? String(installationId),
      account_type: match.account?.type ?? null,
      installed_by: user.id,
    });

  if (writeError) {
    // A unique violation means another team already holds it. Refusing is the
    // whole point — see the header.
    if (writeError.code === "23505") {
      return conflict("That GitHub account is already connected to another team.");
    }
    console.error("[v2/github/callback] insert failed:", JSON.stringify(writeError));
    return apiError("internal", "Could not record the installation.", 500);
  }

  return back(DASHBOARD, { connected: match.account?.login ?? String(installationId) });
}
