/**
 * Derives the public base URL of the application from an incoming request.
 *
 * Priority order:
 *   1. x-forwarded-host + x-forwarded-proto   (set by reverse proxies / CDNs)
 *   2. host header + inferred proto
 *   3. DOMAIN env var (configured deployment origin)
 *   4. http://localhost:3000 (local fallback)
 */
export function getAppBaseUrl(request: Request | { headers: Headers; url: string }): string {
  const forwardedHost = (request.headers as Headers).get("x-forwarded-host");
  const forwardedProto = (request.headers as Headers).get("x-forwarded-proto");
  const hostHeader = (request.headers as Headers).get("host");

  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const requestUrl = new URL(request.url);
  const host = hostHeader || requestUrl.host;
  if (host) {
    const normalizedHost = host.replace(/^0\.0\.0\.0(?=[:]|$)/, "localhost");
    const proto =
      process.env.NODE_ENV === "development"
        ? "http"
        : requestUrl.protocol.replace(":", "") || "https";
    return `${proto}://${normalizedHost}`;
  }

  return (process.env.DOMAIN || "http://localhost:3000").replace(/\/$/, "");
}
