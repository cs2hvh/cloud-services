import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Two account-state decisions that every credential path has to make the
 * same way, whichever helper established the identity:
 *
 *   1. SECOND FACTOR. An account that has enrolled and verified a TOTP factor
 *      is entitled to aal2, and a session or token still at aal1 is a
 *      password-only login that skipped the TOTP step. Until 2026-09-05 that
 *      check lived only in the browser; it was then added to the cookie
 *      helper and the dashboard middleware, which left the bearer-token
 *      helper, the admin guard, the v1 JWT path and the v2 caller admitting
 *      password-only sessions. The helpers here are what those paths share.
 *
 *   2. SUSPENSION. user_profiles.suspend is written by the admin users
 *      routes and was read by nothing on any request path, so suspending an
 *      account changed a flag and nothing else. It is read here with the
 *      service client so it applies to cookie sessions, bearer tokens and
 *      personal access tokens alike.
 *
 * Both fail OPEN when the fact cannot be read (a thrown call, a database
 * blip): a read failure is not evidence about the user, and turning it into a
 * platform-wide lockout is the worse outcome. A definite aal1-where-aal2-is-
 * required, or a definite suspend = true, is refused.
 */

export type Assurance = "aal1" | "aal2";

/** True when the account has a verified factor, i.e. aal2 is what it is entitled to. */
export function requiresSecondFactor(user: Pick<User, "factors"> | null | undefined): boolean {
  return Boolean(user?.factors?.some((f) => f.status === "verified"));
}

/**
 * The `aal` claim of a Supabase access token. The token is NOT verified here:
 * callers use this only after supabase.auth.getUser(token) has accepted it,
 * so the claim is read from a token Supabase has already vouched for.
 * Returns null when the claim is absent or the token is not a JWT.
 */
export function assuranceFromAccessToken(token: string): Assurance | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { aal?: unknown };
    return claims.aal === "aal2" ? "aal2" : claims.aal === "aal1" ? "aal1" : null;
  } catch {
    return null;
  }
}

/**
 * The refusal condition, in one place: a verified factor exists and the
 * current level is definitely aal1. An unreadable level (null) is allowed,
 * per the fail-open rule above.
 */
export function secondFactorMissing(
  user: Pick<User, "factors"> | null | undefined,
  current: Assurance | null
): boolean {
  return requiresSecondFactor(user) && current === "aal1";
}

/**
 * The same decision for a cookie-backed client, which can ask Supabase for
 * the session's assurance level directly. Returns true only on a definite
 * aal1-where-aal2-is-required; a thrown call is logged and allowed.
 */
export async function sessionSecondFactorMissing(
  client: SupabaseClient,
  where: string
): Promise<boolean> {
  try {
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch (error) {
    console.error(
      `[${where}] assurance level unreadable, allowing:`,
      error instanceof Error ? error.message : "unknown"
    );
    return false;
  }
}

/**
 * user_profiles.suspend for one user. `client` lets a caller that must stay
 * inside its own RLS boundary (the v2 PaaS API) read its own row; everyone
 * else reads with the service client so the answer does not depend on which
 * credential the request carried.
 */
export async function isSuspended(userId: string, client?: SupabaseClient): Promise<boolean> {
  try {
    const supabase = client ?? (await createServiceClient());
    const { data, error } = await supabase
      .from("user_profiles")
      .select("suspend")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[isSuspended] read failed, allowing:", error.message);
      return false;
    }
    return (data as { suspend?: boolean | null } | null)?.suspend === true;
  } catch (error) {
    console.error("[isSuspended] read threw, allowing:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

/** The one response body every API path returns for a suspended account. */
export const SUSPENDED_RESPONSE = {
  message: "This account is suspended. Contact support.",
  code: "account_suspended",
} as const;

/** The one response body every API path returns for a missing second factor. */
export const MFA_REQUIRED_RESPONSE = {
  message: "Two-factor authentication required",
  code: "mfa_required",
} as const;
