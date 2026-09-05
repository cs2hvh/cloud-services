/**
 * API Authentication Helper
 * Supports both JWT (session) and PAT (Personal Access Token) authentication
 */
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { ApiKeys } from "@/lib/supabase/queries/api_keys";
import {
  MFA_REQUIRED_RESPONSE,
  SUSPENDED_RESPONSE,
  assuranceFromAccessToken,
  isSuspended,
  secondFactorMissing,
} from "@/lib/auth/assurance";

export type ApiAuthResult =
  | {
      authenticated: true;
      kind: "session";
      userId: string;
      email?: string;
      plan: "free" | "pro" | "enterprise";
    }
  | {
      authenticated: true;
      kind: "pat";
      tokenId: string;
      userId: string;
      plan: "free" | "pro" | "enterprise";
    }
  | {
      authenticated: false;
      error: string;
      status: 401 | 403;
    };

/**
 * Authenticate API request using JWT or PAT
 */
export async function authenticateApiRequest(
  request: Request
): Promise<ApiAuthResult> {
  const authHeader = request.headers.get("authorization");

  // No auth header
  if (!authHeader) {
    return {
      authenticated: false,
      error: "Missing Authorization header",
      status: 401,
    };
  }

  // Extract token
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) {
    return {
      authenticated: false,
      error: "Invalid Authorization header format. Use: Bearer <token>",
      status: 401,
    };
  }

  // Check if token is a PAT (starts with sk_)
  if (token.startsWith("sk_")) {
    try {
      const result = await ApiKeys.validate(token);

      if (!result.valid) {
        return {
          authenticated: false,
          error: result.error,
          status: 401,
        };
      }

      // A PAT is minted by the account, so it carries the account's suspension.
      if (await isSuspended(result.userId)) {
        return { authenticated: false, error: SUSPENDED_RESPONSE.message, status: 403 };
      }
      return {
        authenticated: true,
        kind: "pat",
        tokenId: result.keyId,
        userId: result.userId,
        plan: result.plan,
      };
    } catch (error) {
      console.error("[API Auth PAT] Error:", error);
      return {
        authenticated: false,
        error: "PAT validation failed",
        status: 401,
      };
    }
  }

  // Otherwise assume JWT from Supabase session
  try {
    const supabase = await createClient();
    
    // Verify the JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return {
        authenticated: false,
        error: "Invalid or expired token",
        status: 401,
      };
    }

    // TODO: Lookup user's plan from database
    // For now, default to free
    // A Supabase access token issued by a password login is aal1. If the
    // account has a verified factor, aal1 means the TOTP step was skipped,
    // and this path must refuse it exactly as the cookie path does.
    if (secondFactorMissing(user, assuranceFromAccessToken(token))) {
      return { authenticated: false, error: MFA_REQUIRED_RESPONSE.message, status: 401 };
    }
    if (await isSuspended(user.id)) {
      return { authenticated: false, error: SUSPENDED_RESPONSE.message, status: 403 };
    }
    const plan = "free";

    return {
      authenticated: true,
      kind: "session",
      userId: user.id,
      email: user.email,
      plan,
    };
  } catch (error) {
    console.error("[API Auth JWT] Error:", error);
    return {
      authenticated: false,
      error: "Authentication failed",
      status: 401,
    };
  }
}

/**
 * Get rate limit configuration based on auth type and plan.
 *
 * Rate limiting is always scoped to the USER (not to the PAT token).
 * This prevents abuse where a user creates 10 tokens to get 10× the quota.
 * All tokens belonging to a user share a single quota bucket.
 *
 * Usage:
 *   const { limit, windowMs } = getRateLimitConfig(auth);
 *   await limitByUser(auth.userId, { prefix: "api:v1", limit, windowMs });
 */
export function getRateLimitConfig(auth: ApiAuthResult) {
  if (!auth.authenticated) {
    return { limit: 10, windowMs: 60_000 }; // Unauthenticated: 10/min
  }

  // Different limits based on plan
  const limits = {
    free:       { limit: 30,  windowMs: 60_000 }, // 30/min
    pro:        { limit: 100, windowMs: 60_000 }, // 100/min
    enterprise: { limit: 500, windowMs: 60_000 }, // 500/min
  };

  return limits[auth.plan] ?? limits.free;
}

/**
 * Resolve the user's email from an authenticated result.
 * For session auth, uses the email from the JWT.
 * For PAT auth, fetches from Supabase admin API since PAT tokens carry no email.
 * Returns undefined silently on any lookup failure.
 */
export async function resolveAuthEmail(
  auth: Extract<ApiAuthResult, { authenticated: true }>,
): Promise<string | undefined> {
  if (auth.kind === "session") {
    return auth.email;
  }

  try {
    const supabase = await createWorkerClient();
    const { data } = await supabase.auth.admin.getUserById(auth.userId);
    return data.user?.email ?? undefined;
  } catch {
    return undefined;
  }
}
