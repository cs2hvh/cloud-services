/**
 * GET /api/v2/bitbucket/callback?code=…&state=…
 *
 * Where Bitbucket sends the user after they grant access. Exchanges the code,
 * asks Bitbucket which workspace the token grants, and records the connection
 * against the team the STATE was minted for.
 *
 * Same two rules as the GitLab callback, for the same reasons:
 *
 *   THE TEAM COMES FROM SIGNED STATE, not from the session. Using the session
 *   would let an attacker who starts an authorisation get a victim to open the
 *   callback, binding the ATTACKER'S account to the VICTIM'S team — every
 *   project that team creates afterwards builds attacker-controlled code.
 *   The session is still checked, but only to prove the caller may act on the
 *   team the state names. Both, neither alone.
 *
 *   THE IDENTITY COMES FROM THE TOKEN. Nothing on the query string names the
 *   workspace.
 *
 * ONE DIFFERENCE FROM GITLAB, and it is a refusal rather than a fallback: a
 * Bitbucket token can grant SEVERAL workspaces. `bitbucketIdentity` refuses
 * that rather than choosing, because the API's ordering is not stable and the
 * same token could bind a different workspace on a retry. The user is told to
 * authorise for one workspace instead of us guessing which of their employers
 * they meant.
 */

import { createClient } from "@/lib/supabase/server";
import { providerConfig, bitbucketOauth } from "@/lib/paas/providers/config";
import { verifyState, parseTokenResponse, bitbucketIdentity } from "@/lib/paas/providers/oauth";
import { encryptConnectionToken } from "@/lib/paas/providers/credentials";
import { unauthenticated, invalid, notFound, conflict, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DASHBOARD = "/dashboard/services/apps";

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

  // A refusal arrives as a redirect with ?error=, not as a failure. The user
  // pressed Cancel; that is a normal outcome and does not page anyone.
  if (url.searchParams.get("error")) return back({ error: "bitbucket_denied" });

  const code = url.searchParams.get("code");
  if (!code) return invalid("code is missing.");

  const state = verifyState(url.searchParams.get("state"), "bitbucket");
  if (!state.ok) {
    // One message for every state failure. Distinguishing expired from forged
    // tells someone probing which half they got right.
    return invalid("This authorisation link is no longer valid. Start again from the dashboard.");
  }

  const { data: team, error: teamError } = await supabase
    .schema("paas")
    .from("teams")
    .select("id,ref")
    .eq("ref", state.payload.teamRef)
    .maybeSingle<{ id: string; ref: string }>();
  if (teamError) {
    console.error("[v2/bitbucket/callback] team lookup failed:", JSON.stringify(teamError));
    return apiError("internal", "Could not load your account. Nothing has been recorded.", 500);
  }
  // RLS hides teams the caller cannot see, so invisible and absent arrive
  // identically — which is the right answer to both.
  if (!team) return notFound("Team");

  // ── exchange ──────────────────────────────────────────────────────────────
  //
  // Bitbucket wants the client credentials as HTTP Basic rather than in the
  // form body. Sending them in the body returns a 401 that reads exactly like a
  // bad code, which is a long way to look for a header.
  let tokens;
  try {
    const basic = Buffer.from(
      `${providerConfig.bitbucket.clientId()}:${providerConfig.bitbucket.clientSecret()}`,
    ).toString("base64");

    const res = await fetch(bitbucketOauth.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: providerConfig.callbackUrl("bitbucket"),
      }),
    });
    tokens = parseTokenResponse(await res.json());
  } catch (e) {
    console.error("[v2/bitbucket/callback] token exchange failed:", (e as Error).message);
    return apiError("upstream_error", "Bitbucket did not complete the authorisation. Nothing has been recorded.", 502);
  }

  // ── which workspace? ──────────────────────────────────────────────────────
  let identity;
  try {
    identity = await bitbucketIdentity(tokens.accessToken, (u, init) => fetch(u, init));
  } catch (e) {
    const message = (e as Error).message;
    console.error("[v2/bitbucket/callback] identity failed:", message);
    // The multi-workspace refusal is the user's to resolve, not an outage, so
    // it gets an answer they can act on rather than a generic 502.
    if (message.includes("Refusing to guess")) {
      return invalid(
        "That Bitbucket account has access to more than one workspace. Authorise for a single workspace and try again.",
      );
    }
    return apiError("upstream_error", "Could not confirm the Bitbucket workspace. Nothing has been recorded.", 502);
  }

  // ── store ─────────────────────────────────────────────────────────────────
  //
  // Encrypted here, so the database receives ciphertext in a bind parameter and
  // never a plaintext credential — not in a query log, not in
  // pg_stat_statements.
  const access = encryptConnectionToken("bitbucket", identity.externalId, "access", tokens.accessToken);
  const refresh = tokens.refreshToken
    ? encryptConnectionToken("bitbucket", identity.externalId, "refresh", tokens.refreshToken)
    : null;

  const { error: writeError } = await supabase.schema("paas").rpc("link_installation", {
    p_provider: "bitbucket",
    p_external_id: identity.externalId,
    p_team_ref: team.ref,
    p_account_login: identity.accountLogin,
    p_account_type: identity.accountType,
    // The slug is stored for display only — the UUID is the identity, because a
    // slug is renameable and a connection keyed on one silently detaches.
    p_metadata: { workspaceSlug: identity.accountLogin },
    p_access_token_ct: `\\x${access.tokenCt.toString("hex")}`,
    p_refresh_token_ct: refresh ? `\\x${refresh.tokenCt.toString("hex")}` : null,
    p_token_dek_id: access.dekId,
    p_token_expires_at: tokens.expiresAt,
  });

  if (writeError) {
    if (writeError.code === "23505") {
      return conflict("That Bitbucket workspace is already connected to another team.");
    }
    console.error("[v2/bitbucket/callback] link failed:", JSON.stringify(writeError));
    return apiError("internal", "Could not record the connection.", 500);
  }

  return back({ connected: identity.accountLogin, provider: "bitbucket" });
}
