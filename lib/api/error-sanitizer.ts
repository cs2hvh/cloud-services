/**
 * Error Sanitizer Utility
 * Prevents sensitive error details from leaking to API responses.
 *
 * CRITICAL SECURITY: Never expose raw errors in production — they may
 * contain database schema info, internal paths, stack traces, or secrets.
 *
 * Usage:
 *   sanitizeError(error)               — general errors
 *   sanitizeAuthError(error)           — Supabase auth errors
 *   sanitizeValidationError(zodErrors) — Zod validation errors
 *   logError(context, error)           — log server-side before sanitizing
 */

const isDev = process.env.NODE_ENV === "development";

// ─── Safe message map ──────────────────────────────────────────────────────

const SAFE_MESSAGES = {
  // Auth
  invalid_credentials: "Invalid email or password",
  user_not_found: "Invalid email or password", // same as above — prevents user enumeration
  email_taken: "An account with this email already exists",
  email_not_confirmed: "Please verify your email before signing in",
  weak_password: "Password does not meet requirements",
  invalid_email: "Please enter a valid email address",
  session_expired: "Your session has expired. Please sign in again.",
  unauthorized: "Unauthorized",
  // MFA
  invalid_totp: "Invalid verification code",
  factor_not_found: "MFA factor not found",
  too_many_attempts: "Too many attempts. Please try again later.",
  // General
  not_found: "Resource not found",
  forbidden: "Access denied",
  validation_error: "Invalid request data",
  server_error: "An unexpected error occurred. Please try again.",
} as const;

type SafeMessageKey = keyof typeof SAFE_MESSAGES;

// ─── Sensitive patterns — NEVER leak these ────────────────────────────────

const SENSITIVE_PATTERNS = [
  /postgres|supabase|database|sql/i,
  /connection|timeout|ECONNREFUSED|ETIMEDOUT/i,
  /schema|table|column|constraint|foreign key|unique violation/i,
  /syntax error|internal server/i,
  /stack.*trace|at line \d+/i,
  /\.(ts|js):\d+/,
  /node_modules/i,
  /jwt|bearer|token|secret|password|credential/i,
  /relation .* does not exist|column .* does not exist/i,
  /\/home\/|\/var\/|\/usr\/|\/etc\//i,
];

function hasSensitiveContent(message: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(message));
}

// ─── Log redaction ────────────────────────────────────────────────────────

const REDACT_PATTERNS: [RegExp, string][] = [
  [/(password|token|secret|key|credential)=[^\s&]+/gi, "$1=[REDACTED]"],
  [/Bearer\s+[A-Za-z0-9\-_./]+/gi, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, "[JWT_REDACTED]"],
];

function redactMessage(message: string): string {
  return REDACT_PATTERNS.reduce((m, [pattern, replacement]) => m.replace(pattern, replacement), message);
}

// ─── Logging ───────────────────────────────────────────────────────────────

/**
 * Log an error server-side before sanitizing it for the client.
 * Always call this so production errors are traceable in server logs.
 *
 * @param context  Identifies the route/function — e.g. "POST /api/auth/signup"
 * @param error    The raw error
 */
export function logError(context: string, error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as Record<string, unknown>).message)
        : String(error);

  if (isDev) {
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[${context}]`, message, stack ?? "");
  } else {
    // Prod: redact sensitive values, omit stack traces
    console.error(`[${context}]`, redactMessage(message));
  }
}

// ─── Core sanitizers ───────────────────────────────────────────────────────

/**
 * Sanitize any error for a safe API response string.
 *
 * @param error       Raw error (Error, string, unknown)
 * @param fallbackKey Key into SAFE_MESSAGES to use when the message must be hidden
 */
export function sanitizeError(
  error: unknown,
  fallbackKey: SafeMessageKey = "server_error"
): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as Record<string, unknown>).message)
          : "";

  if (isDev) return message || SAFE_MESSAGES[fallbackKey];

  if (hasSensitiveContent(message)) {
    return SAFE_MESSAGES[fallbackKey];
  }

  // Always return fallback in production for unknown errors.
  // Routes with controlled user-facing messages (e.g. AppOperationError)
  // should return err.message directly instead of calling sanitizeError.
  return SAFE_MESSAGES[fallbackKey];
}

/**
 * Supabase auth errors: map known messages → safe user-facing text.
 * Falls back to sanitizeError for anything unrecognised.
 */
export function sanitizeAuthError(error: unknown): string {
  if (!error) return SAFE_MESSAGES.server_error;

  const message =
    error instanceof Error ? error.message : String(error ?? "");

  if (isDev) return message;

  // Ordered: most specific first
  const authMap: [string, string][] = [
    ["Invalid login credentials", SAFE_MESSAGES.invalid_credentials],
    ["Email not confirmed", SAFE_MESSAGES.email_not_confirmed],
    ["User already registered", SAFE_MESSAGES.email_taken],
    ["already been registered", SAFE_MESSAGES.email_taken],
    ["Password should be at least", SAFE_MESSAGES.weak_password],
    ["Invalid TOTP code", SAFE_MESSAGES.invalid_totp],
    ["Factor not found", SAFE_MESSAGES.factor_not_found],
    ["Email rate limit exceeded", SAFE_MESSAGES.too_many_attempts],
    ["For security purposes", SAFE_MESSAGES.too_many_attempts],
    ["over_email_send_rate_limit", SAFE_MESSAGES.too_many_attempts],
  ];

  for (const [pattern, safe] of authMap) {
    if (message.includes(pattern)) return safe;
  }

  // Unknown auth error — fall back to generic sanitizer
  return sanitizeError(error, "server_error");
}

/**
 * Sanitize Zod validation errors.
 * Dev:  returns full path + message per field for easy debugging.
 * Prod: returns only field names with no validation message details.
 *
 * Response shape: { error: string; details?: Array<{path?: string[]; message?: string}> }
 * Matches what frontend consumers expect from .details
 */
export function sanitizeValidationError(
  errors: Array<{ path?: (string | number)[]; message?: string }>
): { error: string; details?: Array<{ path?: string[]; message?: string }> } {
  if (!Array.isArray(errors) || errors.length === 0) {
    return { error: SAFE_MESSAGES.validation_error };
  }

  if (isDev) {
    // Full detail for debugging
    return {
      error: "Validation error",
      details: errors.map((e) => ({
        path: e.path?.map(String),
        message: e.message ?? "invalid",
      })),
    };
  }

  // Prod: expose field names + safe message — no schema-revealing Zod internals
  const seen = new Set<string>();
  const details: Array<{ path: string[]; message: string }> = [];
  for (const e of errors) {
    const fieldName = e.path?.[0]?.toString();
    if (fieldName && !seen.has(fieldName)) {
      seen.add(fieldName);
      details.push({ path: [fieldName], message: "invalid" });
    }
  }

  return {
    error: "Validation error",
    ...(details.length > 0 && { details }),
  };
}
