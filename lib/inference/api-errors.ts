/**
 * Centralized error response helpers for inference API routes.
 *
 * Goal: 4xx errors stay specific (user supplied bad input — they need to
 * know what to fix); 5xx errors stay GENERIC client-side (don't leak
 * internal exception messages, stack traces, or upstream provider names)
 * while logging the real exception server-side for ops.
 *
 * Why this matters for enterprise customers:
 * - Stack traces that mention "OpenRouter" or "RunPod" leak our upstream
 *   stack — competitive intel + branding violation.
 * - Internal error messages can contain DB schema names, AWS error codes,
 *   etc. that customers shouldn't see.
 * - Consistent error envelope simplifies client SDK error handling.
 */
import { NextResponse } from "next/server";

export interface InferenceErrorBody {
  error: string;
  code?: string;
}

/** Standard 500 response — logs real exception, returns generic message. */
export function internalError(
  context: string,
  err: unknown,
  code: string = "internal_error"
): NextResponse<InferenceErrorBody> {
  console.error(
    `[Inference] ${context}:`,
    err instanceof Error ? `${err.message}\n${err.stack}` : err
  );
  return NextResponse.json(
    { error: "An internal error occurred. Please try again or contact support.", code },
    { status: 500 }
  );
}

/** 400 with a specific message — for user-input failures where the caller
 *  needs to know what to fix. */
export function badRequest(message: string, code?: string): NextResponse<InferenceErrorBody> {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status: 400 });
}

/** 401 — generic by design (don't reveal what's missing). */
export function unauthorized(): NextResponse<InferenceErrorBody> {
  return NextResponse.json({ error: "Authentication required", code: "unauthorized" }, { status: 401 });
}

/** 403 — generic; don't disclose what role/permission was missing. */
export function forbidden(message: string = "Forbidden"): NextResponse<InferenceErrorBody> {
  return NextResponse.json({ error: message, code: "forbidden" }, { status: 403 });
}

/** 404 — generic, never reveal whether the resource existed but wasn't visible. */
export function notFound(resource: string = "Resource"): NextResponse<InferenceErrorBody> {
  return NextResponse.json({ error: `${resource} not found`, code: "not_found" }, { status: 404 });
}

/** 429 — rate limit hit. */
export function tooManyRequests(retryAfterSec?: number): NextResponse<InferenceErrorBody> {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again shortly.",
      code: "rate_limited",
      ...(retryAfterSec ? { retry_after_seconds: retryAfterSec } : {}),
    },
    {
      status: 429,
      headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
    }
  );
}
