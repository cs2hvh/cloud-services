/**
 * SSRF-guarded fetch for the MCP SDK's OAuth flow (doc 14 §5, §10 decision #2).
 *
 * discoverOAuthServerInfo/startAuthorization/exchangeAuthorization/
 * refreshAuthorization all accept a `fetchFn` option — the SDK follows
 * whatever URLs a customer-controlled MCP server's RFC 9728/8414 metadata
 * documents point at (protected-resource metadata, authorization-server
 * metadata, the token endpoint itself). None of those URLs are ones we chose;
 * they're read from a document a third party served us. Doc 14 §5 flags this
 * explicitly: "OAuth discovery URLs are themselves an SSRF vector... the same
 * URL guard applies to PRM/discovery/redirect fetches when M6 lands." This is
 * that guard, reusing the same validated-then-pinned fetch url-ingest.ts
 * already built for the KB URL-ingest feature — not a new SSRF primitive.
 */
import { assertPublicHttpUrl } from "@/lib/inference/url-ingest";

// Found live (2026-07-10): registering an OAuth server whose domain doesn't
// actually run an OAuth server (any real-world typo, or just a server that's
// down) hung the /oauth/authorize request indefinitely — discoverOAuthServerInfo
// tries several .well-known fallback URLs with no timeout of its own, and
// neither did this wrapper. Confirmed by three live attempts that each took
// exactly as long as the client's own timeout (30s/90s/150s) rather than
// converging on a fixed duration — proof the underlying call never completes
// on its own. 15s per hop, matching url-ingest.ts's fetch-timeout convention.
const FETCH_TIMEOUT_MS = 15_000;

/** Matches the SDK's `FetchLike` type (a fetch-compatible signature) closely
 *  enough to satisfy every OAuth helper's `fetchFn` parameter. */
export async function ssrfGuardedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString();
  await assertPublicHttpUrl(url); // throws with a clear message on a private/internal/non-http(s) target
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])
    : AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return fetch(input as never, { ...init, signal });
}
