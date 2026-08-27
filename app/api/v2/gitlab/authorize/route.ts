/**
 * GET /api/v2/gitlab/authorize
 *
 * Starts the GitLab OAuth flow: mints the signed state and redirects. The
 * callback is the other half.
 *
 * THIS ROUTE IS WHERE THE STATE IS BOUND TO A TEAM, which is what makes the
 * callback safe. Minting it here — server-side, after the session has been
 * checked and the team resolved — is the only point at which we know both who
 * is asking and which team they mean. A state minted in the browser, or one
 * that simply echoed a query parameter, would carry whatever the caller chose.
 */

import { createClient } from "@/lib/supabase/server";
import { providerConfig, gitlabOauth } from "@/lib/paas/providers/config";
import { mintState } from "@/lib/paas/providers/oauth";
import { unauthenticated, apiError } from "../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  // The caller's own team, resolved server-side. Never taken from a parameter:
  // the whole point of signing the state is that the team inside it was chosen
  // by us, not by whoever opened this URL.
  const { data: team, error: teamError } = await supabase
    .schema("paas")
    .rpc("bootstrap_personal_team")
    .single<{ id: string; ref: string }>();
  if (teamError || !team) {
    console.error("[v2/gitlab/authorize] bootstrap failed:", JSON.stringify(teamError));
    return apiError("internal", "Could not load your account.", 500);
  }

  let url: URL;
  try {
    const host = providerConfig.gitlab.host();
    url = new URL(gitlabOauth.authorizeUrl(host));
    url.searchParams.set("client_id", providerConfig.gitlab.clientId());
    url.searchParams.set("redirect_uri", providerConfig.callbackUrl("gitlab"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", gitlabOauth.scopes);
    url.searchParams.set("state", mintState("gitlab", team.ref));
  } catch (e) {
    // A missing client id or signing key throws here rather than producing an
    // authorize URL that GitLab rejects with an error the user cannot act on.
    console.error("[v2/gitlab/authorize] not configured:", (e as Error).message);
    return apiError("internal", "GitLab connections are not configured on this deployment.", 500);
  }

  return Response.redirect(url.toString(), 303);
}
