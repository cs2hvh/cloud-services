/**
 * GET /api/v2/gitlab/callback?code=…&state=…
 *
 * Where GitLab sends the user after they authorise the application. Exchanges
 * the code for a token, asks GitLab who the token belongs to, and records the
 * connection against the team the STATE was minted for.
 *
 * WHY THE TEAM COMES FROM STATE AND NOT FROM THE SESSION.
 *
 * Both are available here, and using the session would be the obvious choice.
 * It is the wrong one: an attacker who starts an authorisation and then gets a
 * victim to open the callback URL would have the victim's session name the
 * team, binding the ATTACKER'S GitLab account to the VICTIM'S team. Every
 * project that team creates afterwards builds from repositories the attacker
 * controls, which is arbitrary code in our build VMs and on the customer's
 * hostname.
 *
 * So the team is read from the signed state, and the session is used only to
 * prove the caller may act on that team at all. Both checks, neither alone.
 *
 * THE IDENTITY COMES FROM THE TOKEN. Nothing in the query string names the
 * account. That is the deploy lane's rule 2 in the shape OAuth gives it: there
 * is no guessable installation id to verify, but there is still a URL a caller
 * controls, and nothing on it may become a stored fact.
 */

import { createClient } from "@/lib/supabase/server";
import { providerConfig, gitlabOauth } from "@/lib/paas/providers/config";
import { verifyState, parseTokenResponse, gitlabIdentity } from "@/lib/paas/providers/oauth";
import { encryptConnectionToken } from "@/lib/paas/providers/credentials";
import { unauthenticated, invalid, notFound, conflict, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DASHBOARD = "/dashboard/v2/projects";

function back(params: Record<string, string>): Response {
  const q = new URLSearchParams(params).toString();
  return Response.redirect(`${DASHBOARD}${q ? `?${q}` : ""}`, 303);
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  const url = new URL(req.url);

  // GitLab reports a refusal by redirecting here with ?error=, not by failing.
  // Treated as a normal outcome — the user pressed Cancel — rather than an
  // exception, so it does not page anyone.
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return back({ error: "gitlab_denied" });
  }

  const code = url.searchParams.get("code");
  if (!code) return invalid("code is missing.");

  const state = verifyState(url.searchParams.get("state"), "gitlab");
  if (!state.ok) {
    // One message for every state failure. Distinguishing expired from forged
    // tells someone probing which half they got right.
    return invalid("This authorisation link is no longer valid. Start again from the dashboard.");
  }

  // The caller must be able to administer the team the state names. Without
  // this, a signed state leaked from another user's browser would let its
  // holder bind their own account to that user's team.
  const { data: team, error: teamError } = await supabase
    .schema("paas")
    .from("teams")
    .select("id,ref")
    .eq("ref", state.payload.teamRef)
    .maybeSingle<{ id: string; ref: string }>();
  if (teamError) {
    console.error("[v2/gitlab/callback] team lookup failed:", JSON.stringify(teamError));
    return apiError("internal", "Could not load your account. Nothing has been recorded.", 500);
  }
  // RLS hides teams the caller cannot see, so "not visible" and "not present"
  // arrive identically — which is the correct answer to both.
  if (!team) return notFound("Team");

  const host = providerConfig.gitlab.host();

  // ── exchange ──────────────────────────────────────────────────────────────
  let tokens;
  try {
    const res = await fetch(gitlabOauth.tokenUrl(host), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: providerConfig.gitlab.clientId(),
        client_secret: providerConfig.gitlab.clientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: providerConfig.callbackUrl("gitlab"),
      }),
    });
    // parseTokenResponse checks the BODY for an OAuth error as well, because a
    // refusal often arrives with HTTP 200.
    tokens = parseTokenResponse(await res.json());
  } catch (e) {
    console.error("[v2/gitlab/callback] token exchange failed:", (e as Error).message);
    return apiError("upstream_error", "GitLab did not complete the authorisation. Nothing has been recorded.", 502);
  }

  // ── who is this? ──────────────────────────────────────────────────────────
  let identity;
  try {
    identity = await gitlabIdentity(host, tokens.accessToken, (u, init) => fetch(u, init));
  } catch (e) {
    console.error("[v2/gitlab/callback] identity failed:", (e as Error).message);
    return apiError("upstream_error", "Could not confirm the GitLab account. Nothing has been recorded.", 502);
  }

  // ── store ─────────────────────────────────────────────────────────────────
  //
  // Encrypted HERE, so the database receives ciphertext in a bind parameter and
  // never a plaintext credential — not in a query log, not in
  // pg_stat_statements. The master key stays out of the database entirely.
  const access = encryptConnectionToken("gitlab", identity.externalId, "access", tokens.accessToken);
  const refresh = tokens.refreshToken
    ? encryptConnectionToken("gitlab", identity.externalId, "refresh", tokens.refreshToken)
    : null;

  const { error: writeError } = await supabase.schema("paas").rpc("link_installation", {
    p_provider: "gitlab",
    p_external_id: identity.externalId,
    p_team_ref: team.ref,
    p_account_login: identity.accountLogin,
    p_account_type: identity.accountType,
    p_metadata: { host },
    // Postgres bytea over PostgREST takes hex with a \x prefix.
    p_access_token_ct: `\\x${access.tokenCt.toString("hex")}`,
    p_refresh_token_ct: refresh ? `\\x${refresh.tokenCt.toString("hex")}` : null,
    p_token_dek_id: access.dekId,
    p_token_expires_at: tokens.expiresAt,
  });

  if (writeError) {
    // The RPC raises unique_violation when another team already holds this
    // connection. Refusing is the point: silently repointing it would move
    // another team's repositories under this caller.
    if (writeError.code === "23505") {
      return conflict("That GitLab account is already connected to another team.");
    }
    console.error("[v2/gitlab/callback] link failed:", JSON.stringify(writeError));
    return apiError("internal", "Could not record the connection.", 500);
  }

  return back({ connected: identity.accountLogin, provider: "gitlab" });
}
