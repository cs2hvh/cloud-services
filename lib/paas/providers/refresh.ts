/**
 * Refreshing an OAuth access token before it strands a build.
 *
 * WHY THIS IS NOT OPTIONAL. GitLab access tokens expire in two hours by
 * default. Without a refresh path, every GitLab connection stops working two
 * hours after it is made, and the symptom is a 401 during clone that reads
 * exactly like a revoked authorisation — so the customer reconnects, and it
 * works, and it breaks again two hours later.
 *
 * GITHUB DOES NOT APPEAR. Its tokens are minted per request from the App
 * private key, so there is nothing to refresh and no refresh token to lose.
 *
 * THE ROTATION TRAP, and it is the reason this file is careful.
 *
 * Both providers issue a NEW REFRESH TOKEN with every refresh and invalidate
 * the old one. So a refresh that succeeds at the provider and fails to persist
 * locally leaves us holding a refresh token that no longer works — the
 * connection is dead and only a full re-authorisation fixes it. That makes the
 * write the dangerous half, not the network call, which is the opposite of the
 * usual shape and is why `refreshToken` returns the new pair rather than
 * writing it: the caller does the write, and can fail loudly.
 *
 * A refresh that returns no new refresh token is REFUSED rather than stored,
 * because storing null there would silently convert a refreshable connection
 * into one that dies at the next expiry with no way back.
 */

import type { GitProvider } from "./types.ts";
import { parseTokenResponse, type TokenSet, type Fetcher } from "./oauth.ts";

export type RefreshableProvider = Exclude<GitProvider, "github">;

export interface RefreshInput {
  provider: RefreshableProvider;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  /** GitLab only. Ignored for Bitbucket, which is cloud-only here. */
  host?: string;
}

/**
 * Exchange a refresh token for a new pair.
 *
 * Throws on anything that is not a complete, usable pair. The caller must treat
 * a throw as "the connection still holds its OLD credential" and NOT overwrite
 * anything — a half-applied refresh is the one failure that cannot be retried.
 */
export async function refreshToken(input: RefreshInput, fetcher: Fetcher, now: Date = new Date()): Promise<TokenSet> {
  const { provider, refreshToken: rt, clientId, clientSecret } = input;
  if (!rt) throw new Error(`[providers/refresh] ${provider} connection has no refresh token — reconnect it`);

  const url =
    provider === "gitlab"
      ? `${(input.host ?? "https://gitlab.com").replace(/\/+$/, "")}/oauth/token`
      : "https://bitbucket.org/site/oauth2/access_token";

  // Bitbucket wants the client credentials as HTTP Basic; GitLab takes them in
  // the body. Sending Bitbucket's in the body returns a 401 that reads exactly
  // like an expired refresh token, which sends someone to re-authorise a
  // customer for a header.
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const body: Record<string, string> = { grant_type: "refresh_token", refresh_token: rt };

  if (provider === "bitbucket") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

  const res = await fetcher(url, { method: "POST", headers, body: new URLSearchParams(body).toString() });

  let parsed: TokenSet;
  try {
    // parseTokenResponse also checks the BODY for an OAuth error, because a
    // refusal arrives with HTTP 200 often enough that the status is not enough.
    parsed = parseTokenResponse(await res.json(), now);
  } catch (e) {
    // The refresh token is never interpolated into this message.
    throw new Error(`[providers/refresh] ${provider} refresh failed (${res.status}): ${(e as Error).message}`);
  }

  if (!parsed.refreshToken) {
    // Storing null here converts a refreshable connection into one that dies at
    // the next expiry with no way back. Both providers rotate, so an absent new
    // refresh token means something is wrong with the response, not that we
    // should keep the old one — which is already invalid by now.
    throw new Error(
      `[providers/refresh] ${provider} returned no new refresh token. Both providers rotate on refresh, ` +
        `so the old one is already invalid — this connection must be re-authorised rather than patched.`,
    );
  }

  return parsed;
}

export type RefreshOutcome =
  /** Not close enough to expiry to bother. */
  | { action: "not-needed" }
  /** Refreshed; the caller must persist `tokens` before using them. */
  | { action: "refreshed"; tokens: TokenSet }
  /**
   * Could not refresh. The OLD credential is untouched and may still work —
   * providers are inconsistent about enforcing expiry — so the caller should
   * try it rather than treating the connection as dead.
   */
  | { action: "failed"; error: string; oldCredentialStillValid: true };

/**
 * Refresh if needed, reporting rather than throwing.
 *
 * The distinction that matters: a failed refresh is NOT a dead connection. The
 * stored token may still work, and treating a refresh failure as fatal would
 * take down a working connection because a token endpoint was briefly down.
 */
export async function refreshIfNeeded(
  input: RefreshInput & { expiresAt: string | null },
  fetcher: Fetcher,
  now: Date = new Date(),
): Promise<RefreshOutcome> {
  const { needsRefresh } = await import("./credentials.ts");
  if (!needsRefresh(input.expiresAt, now)) return { action: "not-needed" };

  try {
    return { action: "refreshed", tokens: await refreshToken(input, fetcher, now) };
  } catch (e) {
    return { action: "failed", error: (e as Error).message.slice(0, 300), oldCredentialStillValid: true };
  }
}
