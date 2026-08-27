/**
 * GET /api/v2/bitbucket/authorize
 *
 * Starts the Bitbucket OAuth flow: mints the signed state and redirects.
 *
 * As with GitLab, the state is bound to a team HERE — server-side, after the
 * session is checked and the team resolved. That is the only point at which we
 * know both who is asking and which team they mean, and it is what makes the
 * callback safe to act on.
 */

import { createClient } from "@/lib/supabase/server";
import { providerConfig, bitbucketOauth } from "@/lib/paas/providers/config";
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

  const { data: team, error: teamError } = await supabase
    .schema("paas")
    .rpc("bootstrap_personal_team")
    .single<{ id: string; ref: string }>();
  if (teamError || !team) {
    console.error("[v2/bitbucket/authorize] bootstrap failed:", JSON.stringify(teamError));
    return apiError("internal", "Could not load your account.", 500);
  }

  let url: URL;
  try {
    url = new URL(bitbucketOauth.authorizeUrl);
    url.searchParams.set("client_id", providerConfig.bitbucket.clientId());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", mintState("bitbucket", team.ref));
    // Bitbucket takes the redirect URI from the app's registered configuration
    // and ignores a mismatching one — so it is set here for parity and to fail
    // early in local development, not because it is authoritative.
    url.searchParams.set("redirect_uri", providerConfig.callbackUrl("bitbucket"));
    url.searchParams.set("scope", bitbucketOauth.scopes);
  } catch (e) {
    console.error("[v2/bitbucket/authorize] not configured:", (e as Error).message);
    return apiError("internal", "Bitbucket connections are not configured on this deployment.", 500);
  }

  return Response.redirect(url.toString(), 303);
}
