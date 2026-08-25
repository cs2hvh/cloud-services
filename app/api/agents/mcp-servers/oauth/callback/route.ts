/**
 * GET /api/agents/mcp-servers/oauth/callback — completes the OAuth 2.1
 * consent flow (M6, doc 14 §10 decision #2). The provider redirects the
 * customer's browser here with `?code=...&state=...` after they approve.
 *
 * Deliberately does NOT require a fresh session: the signed `state` param
 * (lib/mcp/oauth-state.ts) is itself the security boundary — it's
 * AES-GCM-encrypted with our DEK, so it can't be forged or replayed past its
 * 10-minute TTL, and it carries the org_id or the request is scoped to.
 * Requiring a live session cookie on top would be redundant and fragile
 * (some browsers restrict cookies across the provider's redirect chain even
 * for a same-site top-level navigation back).
 */
import { NextRequest, NextResponse } from "next/server";
import { discoverOAuthServerInfo, exchangeAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { AgentcoreMcpServers } from "@/lib/supabase/queries/agentcore";
import { decryptAesGcm, encryptAesGcm, postgresByteaToBytes, bytesToPostgresBytea } from "@/lib/inference/crypto";
import { decodeOAuthState } from "@/lib/mcp/oauth-state";
import { ssrfGuardedFetch } from "@/lib/mcp/oauth-fetch";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

const DASHBOARD_PATH = "/dashboard/services/agents/mcp-servers";

export async function GET(request: NextRequest) {
  const dek = process.env.BYOK_DEK;
  const redirectHome = (query: string) => NextResponse.redirect(new URL(`${DASHBOARD_PATH}?${query}`, request.nextUrl.origin));

  if (!dek) return redirectHome("mcp_oauth=error&reason=server_misconfigured");

  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error");

  if (providerError) {
    return redirectHome(`mcp_oauth=error&reason=${encodeURIComponent(providerError)}`);
  }
  if (!code || !stateParam) {
    return redirectHome("mcp_oauth=error&reason=missing_code_or_state");
  }

  let state;
  try {
    state = await decodeOAuthState(stateParam, dek);
  } catch (err) {
    console.error("[mcp-servers oauth] state decode failed:", err);
    return redirectHome("mcp_oauth=error&reason=invalid_or_expired_state");
  }

  const server = await AgentcoreMcpServers.getForOAuthFlow(state.orgId, state.serverId);
  if (!server || server.auth_type !== "oauth" || !server.oauth_client_id) {
    return redirectHome("mcp_oauth=error&reason=server_not_found");
  }

  const clientSecret = server.oauth_client_secret_enc
    ? await decryptAesGcm(postgresByteaToBytes(server.oauth_client_secret_enc), dek)
    : undefined;
  const callbackUrl = new URL("/api/agents/mcp-servers/oauth/callback", request.nextUrl.origin);

  try {
    const { authorizationServerMetadata } = await discoverOAuthServerInfo(server.server_url, {
      fetchFn: ssrfGuardedFetch,
    });

    const tokens = await exchangeAuthorization(authorizationServerMetadata?.issuer ?? server.server_url, {
      metadata: authorizationServerMetadata,
      clientInformation: { client_id: server.oauth_client_id, client_secret: clientSecret },
      authorizationCode: code,
      codeVerifier: state.codeVerifier,
      redirectUri: callbackUrl,
      resource: new URL(server.server_url),
      fetchFn: ssrfGuardedFetch,
    });

    const accessTokenEnc = bytesToPostgresBytea(await encryptAesGcm(tokens.access_token, dek));
    const refreshTokenEnc = tokens.refresh_token
      ? bytesToPostgresBytea(await encryptAesGcm(tokens.refresh_token, dek))
      : null;
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

    await AgentcoreMcpServers.saveOAuthTokens(state.orgId, state.serverId, {
      oauth_access_token_enc: accessTokenEnc,
      oauth_refresh_token_enc: refreshTokenEnc,
      oauth_token_expires_at: expiresAt,
      oauth_authorization_server_url: authorizationServerMetadata?.issuer ?? server.server_url,
      oauth_status: "connected",
      oauth_last_error: null,
    });

    const ctx = auditContextFrom(request);
    void recordAudit({
      orgId: state.orgId,
      actorUserId: state.userId,
      action: "mcp_server.oauth_connected",
      targetType: "mcp_server",
      targetId: state.serverId,
      metadata: { slug: server.slug },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return redirectHome("mcp_oauth=connected");
  } catch (err) {
    console.error("[mcp-servers oauth] token exchange failed:", err);
    await AgentcoreMcpServers.saveOAuthTokens(state.orgId, state.serverId, {
      oauth_access_token_enc: null,
      oauth_refresh_token_enc: null,
      oauth_token_expires_at: null,
      oauth_status: "error",
      oauth_last_error: err instanceof Error ? err.message : "Token exchange failed",
    });
    return redirectHome("mcp_oauth=error&reason=token_exchange_failed");
  }
}
