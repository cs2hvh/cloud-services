/**
 * API v1 Middleware
 * Wraps any v1 route with: auth → rate limit → handler → standard response
 *
 * Usage:
 *   export const GET = withV1Auth("resource:action", async (req, auth) => {
 *     return v1Ok({ data: [...], meta: { total: 5 } });
 *   });
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, getRateLimitConfig, ApiAuthResult } from "@/lib/api-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

export type AuthContext = Extract<ApiAuthResult, { authenticated: true }>;

type RouteContext = { params: Promise<{ [key: string]: string | string[] }> };
type Handler = (req: NextRequest, auth: AuthContext, context?: RouteContext) => Promise<NextResponse>;

/**
 * Wraps a route handler with authentication and per-user, per-operation rate limiting.
 *
 * Rate limit key: "api:v1:<operation>:<userId>"
 * Each operation gets its own counter — reads don't block writes.
 * All tokens for the same user share one counter — more tokens ≠ more quota.
 */
export function withV1Auth(operation: string, handler: Handler) {
  return async (req: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    const auth = await authenticateApiRequest(req);
    if (!auth.authenticated) {
      return v1Error(auth.error, auth.status);
    }

    const { limit, windowMs } = getRateLimitConfig(auth);
    const rl = await limitByUser(auth.userId, {
      prefix: `api:v1:${operation}`,
      limit,
      windowMs,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", retry_after: rl.retryAfterSec },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(rl.retryAfterSec),
          },
        }
      );
    }

    try {
      const res = await handler(req, auth, context);
      res.headers.set("X-RateLimit-Limit", String(limit));
      res.headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - 1)));
      return res;
    } catch (err) {
      console.error(`[v1/${operation}]`, err);
      return v1Error("Internal server error", 500);
    }
  };
}

/** Standard success response */
export function v1Ok<T>(
  body: { data: T; meta?: Record<string, unknown> },
  status = 200
): NextResponse {
  return NextResponse.json(body, { status });
}

/** Standard error response */
export function v1Error(
  error: string | Record<string, unknown>,
  status = 400,
  message?: string
): NextResponse {
  const errorBody = typeof error === "string" ? { error } : { error: "Validation failed", details: error };
  return NextResponse.json(
    { ...errorBody, ...(message && { message }) },
    { status }
  );
}
