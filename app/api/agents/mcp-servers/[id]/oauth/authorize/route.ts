/**
 * GET /api/agents/mcp-servers/[id]/oauth/authorize — begin the OAuth 2.1
 * consent flow for a registered `auth_type: 'oauth'` MCP server (M6, doc 14
 * §10 decision #2).
 *
 * Session-authed dashboard route: the customer clicks "Connect" next to a
 * pending OAuth server, lands here, and is immediately 302-redirected to the
 * provider's own consent screen. Discovery (RFC 9728/8414) and the
 * authorization-URL/PKCE construction are the SDK's own `discoverOAuthServerInfo`
 * + `startAuthorization` — nothing here reimplements OAuth, this route only
 * wires those calls to our storage and SSRF-guards every discovery fetch
 * (doc 14 §5: "OAuth discovery URLs are themselves an SSRF vector").
 *
 * The PKCE code_verifier can't sit in server memory (this request ends before
 * the browser ever comes back) — it rides inside the signed `state` param,
 * see lib/mcp/oauth-state.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { discoverOAuthServerInfo, startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { AgentcoreMcpServers } from "@/lib/supabase/queries/agentcore";
import { decryptAesGcm, postgresByteaToBytes } from "@/lib/inference/crypto";
import { encodeOAuthState } from "@/lib/mcp/oauth-state";
import { ssrfGuardedFetch } from "@/lib/mcp/oauth-fetch";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUserFromHeader(request);
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:mcp-oauth-authorize", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const { id } = await params;
  const dek = process.env.BYOK_DEK;
  if (!dek) {
    return NextResponse.json({ error: "Server is not configured to store MCP credentials (BYOK_DEK missing)" }, { status: 500 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  const server = await AgentcoreMcpServers.getForOAuthFlow(org.org_id, id);
  if (!server) return NextResponse.json({ error: "MCP server not found in this org" }, { status: 404 });
  if (server.auth_type !== "oauth" || !server.oauth_client_id) {
    return NextResponse.json({ error: "This server is not configured for OAuth" }, { status: 400 });
  }

  const clientSecret = server.oauth_client_secret_enc
    ? await decryptAesGcm(postgresByteaToBytes(server.oauth_client_secret_enc), dek)
    : undefined;

  const callbackUrl = new URL("/api/agents/mcp-servers/oauth/callback", request.nextUrl.origin);

  try {
    const { authorizationServerMetadata } = await discoverOAuthServerInfo(server.server_url, {
      fetchFn: ssrfGuardedFetch,
    });

    const { authorizationUrl, codeVerifier } = await startAuthorization(
      authorizationServerMetadata?.issuer ?? server.server_url,
      {
        metadata: authorizationServerMetadata,
        clientInformation: { client_id: server.oauth_client_id, client_secret: clientSecret },
        redirectUrl: callbackUrl,
        scope: server.oauth_scope ?? undefined,
        resource: new URL(server.server_url),
      }
    );

    const state = await encodeOAuthState(
      { serverId: server.id, orgId: org.org_id, codeVerifier, userId: auth.user!.id },
      dek
    );
    authorizationUrl.searchParams.set("state", state);

    return NextResponse.redirect(authorizationUrl);
  } catch (err) {
    console.error("[mcp-servers oauth] authorize discovery/start failed:", err);
    await AgentcoreMcpServers.saveOAuthTokens(org.org_id, id, {
      oauth_access_token_enc: null,
      oauth_refresh_token_enc: null,
      oauth_token_expires_at: null,
      oauth_status: "error",
      oauth_last_error: err instanceof Error ? err.message : "Failed to start OAuth flow",
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start the OAuth flow with this server" },
      { status: 502 }
    );
  }
}
