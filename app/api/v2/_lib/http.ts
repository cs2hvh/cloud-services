/**
 * JSON helpers for the v2 API.
 *
 * One rule encoded here: a resource the caller cannot see returns 404, not
 * 403. 403 confirms the ref exists, which lets anyone enumerate another
 * team's projects by probing refs. RLS already returns "no rows" for both
 * cases, so notFound() is the honest translation of that result.
 */

export type ApiErrorCode =
  | "unauthenticated"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "not_enabled"
  | "upstream_error"
  | "internal";

export function json<T>(body: T, status = 200): Response {
  return Response.json(body as unknown as Record<string, unknown>, { status });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>
): Response {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

export const unauthenticated = () =>
  apiError("unauthenticated", "Sign in to continue.", 401);

/**
 * Used for both "does not exist" and "exists but not yours". Do not add a
 * 403 variant — see the file header.
 */
export const notFound = (what = "Resource") =>
  apiError("not_found", `${what} not found.`, 404);

export const invalid = (message: string, fields?: Record<string, string>) =>
  apiError("invalid_request", message, 422, fields ? { fields } : undefined);

export const conflict = (message: string) =>
  apiError("conflict", message, 409);

/**
 * A capability the platform has not had switched on yet — Cloudflare for SaaS,
 * a GitHub App with no installations. Distinct from a bug: the caller needs to
 * be told what to enable, not shown a stack trace.
 */
export const notEnabled = (message: string, action?: string) =>
  apiError("not_enabled", message, 503, action ? { action } : undefined);

/**
 * Postgres surfaces the schema's own guarantees as errors. Translating them
 * here keeps every route from re-deriving what "23505" means, and stops raw
 * driver text reaching a caller.
 */
export function fromPostgrestError(
  err: { code?: string | null; message?: string | null } | null
): Response | null {
  if (!err) return null;
  switch (err.code) {
    case "23505": // unique_violation
      return conflict("That value is already taken.");
    case "23503": // foreign_key_violation
      return invalid("Referenced record does not exist.");
    case "23514": // check_violation
      return invalid("Value failed a validation rule.");
    case "42501": // insufficient_privilege — RLS refused the write
      return notFound();
    default:
      return null;
  }
}
