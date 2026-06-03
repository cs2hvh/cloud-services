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
type Handler = (req: NextRequest, auth: AuthContext, context: RouteContext) => Promise<NextResponse>;

/**
 * Wraps a route handler with authentication and per-user, per-operation rate limiting.
 *
 * Rate limit key: "api:v1:<operation>:<userId>"
 * Each operation gets its own counter — reads don't block writes.
 * All tokens for the same user share one counter — more tokens ≠ more quota.
 */
export function withV1Auth(operation: string, handler: Handler) {
  return async (req: NextRequest, context: RouteContext): Promise<NextResponse> => {
    const auth = await authenticateApiRequest(req);
    if (!auth.authenticated) {
      return v1Error("UNAUTHORIZED", auth.status, auth.error || "Authentication failed");
    }

    const { limit, windowMs } = getRateLimitConfig(auth);
    const rl = await limitByUser(auth.userId, {
      prefix: `api:v1:${operation}`,
      limit,
      windowMs,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          details: { retry_after: rl.retryAfterSec },
          // Backward compatibility for any client already reading this field
          retry_after: rl.retryAfterSec,
        },
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
      res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
      return res;
    } catch (err) {
      console.error(`[v1/${operation}]`, err);
      return v1Error("INTERNAL_ERROR", 500, "Internal server error");
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

/** Standard error response with consistent format */
export function v1Error(
  errorCode: string,
  status: number,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  const errorBody: Record<string, unknown> = {
    error: errorCode,
    message,
  };
  
  if (details) {
    errorBody.details = details;
  }
  
  return NextResponse.json(errorBody, { status });
}

/** Validation error response with structured errors */
export function v1ValidationError(
  validationErrors: Array<{ path: string; message: string }>,
  message = "Invalid request body"
): NextResponse {
  return NextResponse.json(
    {
      error: "VALIDATION_ERROR",
      message,
      validation_errors: validationErrors,
    },
    { status: 400 }
  );
}
