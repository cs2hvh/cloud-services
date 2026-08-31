/**
 * GET /api/v2/github/callback?installation_id=…
 *
 * Where GitHub sends the user after they install (or reconfigure) the App.
 * Records the installation against the CALLER'S team so their repositories
 * become deployable.
 *
 * THE INSTALLATION ID IN THE QUERY IS ATTACKER-CONTROLLED. It arrives on a URL
 * the user's browser was told to visit, and anyone can type one.
 *
 * THIS ROUTE USED TO CLAIM THAT CHECKING THE ID AGAINST GITHUB WAS ENOUGH. IT
 * IS NOT, AND THE GAP WAS REAL. `listInstallations()` proves the installation
 * exists on OUR App — that SOMEBODY installed it. It says nothing about who is
 * asking. The team was then taken from `bootstrap_personal_team()`, the
 * CALLER'S own, so any signed-in user who visited this URL with a real but
 * unclaimed installation id bound a stranger's GitHub account to their team
 * and could list and deploy that stranger's repositories. Installation ids are
 * enumerable nine-digit integers that appear in webhook payloads and URLs, and
 * an installation stays unclaimed for as long as nobody finishes the flow —
 * permanently, for anyone who installs from GitHub's own UI and stops there.
 *
 * It was not theoretical: the installation on `cs2hvh` ended up held by a team
 * owned by somebody who does not own that GitHub account, because their
 * session reached this callback first.
 *
 * SO OWNERSHIP IS NOW PROVEN, NOT ASSUMED. The caller's own GitHub identity —
 * the one they signed in with, which Supabase holds and the caller cannot
 * forge — must match the account the installation is on. That covers the
 * personal case exactly.
 *
 * It does NOT cover an org install, where the account is the org and the
 * caller is an admin of it: proving that needs the user's own OAuth token,
 * which this platform deliberately does not store for GitHub. Those go through
 * /api/v2/git/connect instead, whose one-time nonce cookie proves the round
 * trip. Refusing here is not a dead end, it is a redirect to the flow that can
 * actually establish what this one cannot.
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
import { provesInstallationOwnership } from "@/lib/paas/github/ownership";
import { unauthenticated, invalid, notFound, conflict, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DASHBOARD = "/dashboard/services/apps";

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
    return invalid("GitHub did not complete the connection. Start again from the dashboard.");
  }

  // Necessary, not sufficient: this only establishes the installation is one of
  // ours. Ownership is checked below, and that is the part that matters.
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

  // OWNERSHIP. The caller signed in with GitHub, so Supabase holds the identity
  // GitHub asserted about them; it is not user-supplied and cannot be forged by
  // editing a URL. An installation on `cs2hvh` may only be claimed by the
  // person who signs in as `cs2hvh`.
  const githubLogin = (user.identities ?? [])
    .filter((i) => i.provider === "github")
    .map((i) => (i.identity_data as { user_name?: string } | null)?.user_name)
    .find((n): n is string => typeof n === "string" && n.length > 0);

  const installedOn = match.account?.login ?? null;

  // The rule lives in lib/paas/github/ownership.ts and is tested there,
  // including that two blanks do not compare equal.
  const ownership = provesInstallationOwnership(githubLogin, installedOn);

  if (!ownership.proven) {
    // NOT a generic error. The two reasons a legitimate person lands here are
    // an org install and signing in with something other than GitHub, and both
    // are fixed by going through the connect flow — so say which, and send
    // them there rather than leaving them at a wall.
    console.warn(
      `[v2/github/callback] refused: caller github=${githubLogin ?? "(none)"} ` +
        `installation ${installationId} is on ${installedOn ?? "(unknown)"}`,
    );
    return back(DASHBOARD, {
      error: ownership.code,
      detail:
        ownership.reason +
        (ownership.code === "different-account"
          ? " If that is an organisation you administer, connect it from the New project page instead."
          : " Connect from the New project page instead."),
    });
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
      // provider and external_id are the identity now, and both are NOT NULL
      // with no default — omitting them raises 23502 on every connect.
      // installation_id stays in step while the deprecated column exists.
      provider: "github",
      external_id: String(installationId),
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
