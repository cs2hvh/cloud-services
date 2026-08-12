/**
 * OAuth callbacks append a status flag to a caller-supplied `returnTo` path.
 * That path may already carry a query string (e.g.
 * `/dashboard/settings?tab=account`), so the separator has to be chosen at
 * runtime — a hard-coded `?` produces `...?tab=account?error=x`, which parses
 * `tab` as `account?error=x` and loses the flag entirely.
 */
export function withReturnToParam(returnTo: string, key: string, value: string): string {
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
