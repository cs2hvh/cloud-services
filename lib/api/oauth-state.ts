import { createHmac } from "crypto";

/**
 * Returns the HMAC secret for signing OAuth state parameters.
 *
 * In production, a dedicated env var is REQUIRED — using the service role key
 * as a fallback is too risky (key rotation or exposure would compromise OAuth state).
 * In development/test a fallback to SUPABASE_SERVICE_ROLE_KEY is allowed with a warning.
 */
export function getOAuthStateSecret(
  providerSecretEnvVar: string | undefined,
  providerLabel: string,
  dedicatedEnvVarName: string
): string {
  if (!providerSecretEnvVar) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `[${providerLabel} OAuth] ${dedicatedEnvVarName} is not set. ` +
          `This env var is required in production for OAuth state signing. ` +
          `Add it to your deployment environment variables.`
      );
    }
    console.warn(
      `[${providerLabel} OAuth] ${dedicatedEnvVarName} is not set. ` +
        `Falling back to SUPABASE_SERVICE_ROLE_KEY for OAuth state signing. ` +
        `Set a dedicated ${dedicatedEnvVarName} env var (required in production).`
    );
  }
  return providerSecretEnvVar || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Validates a returnTo path, restricting it to internal /dashboard routes only.
 * Rejects anything that could be used for open redirect (external URLs, protocol-relative paths).
 */
/**
 * Git-provider OAuth flows are started from — and belong back on — the
 * Connections tab of settings. The ?tab= is part of the default so callbacks
 * that fall back to it still land the user where they started.
 */
export const DEFAULT_OAUTH_RETURN_TO = "/dashboard/settings?tab=account";

export function sanitizeReturnTo(path: unknown): string {
  if (
    typeof path === "string" &&
    path.startsWith("/dashboard") &&
    !path.startsWith("//")
  ) {
    return path;
  }
  return DEFAULT_OAUTH_RETURN_TO;
}

/**
 * Creates an HMAC-signed OAuth state parameter.
 * Format: base64url(payload).base64url(HMAC-SHA256(payload))
 */
export function createSignedOAuthState(
  secret: string,
  userId: string,
  returnTo: string
): string {
  if (!secret) {
    throw new Error("Missing OAuth state secret — cannot sign state parameter");
  }
  const payload = { userId, returnTo, issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}
