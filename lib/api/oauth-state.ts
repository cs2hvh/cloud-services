import { createHmac } from "crypto";

/**
 * Returns the HMAC secret for signing OAuth state parameters.
 *
 * Prefers the provider-specific secret env var. Falls back to
 * SUPABASE_SERVICE_ROLE_KEY with a loud warning so the misconfiguration
 * is visible in logs. A dedicated secret is strongly preferred — if the
 * service role key rotates or is compromised the OAuth state signing is
 * also affected.
 *
 * @param providerSecretEnvVar  Value of the provider-specific env var (e.g. process.env.GITLAB_STATE_SECRET)
 * @param providerLabel         Human-readable label used in the warning message (e.g. "GitLab")
 * @param dedicatedEnvVarName   Name of the env var that should be set (used in warning message)
 */
export function getOAuthStateSecret(
  providerSecretEnvVar: string | undefined,
  providerLabel: string,
  dedicatedEnvVarName: string
): string {
  if (!providerSecretEnvVar) {
    console.warn(
      `[${providerLabel} OAuth] ${dedicatedEnvVarName} is not set. ` +
        `Falling back to SUPABASE_SERVICE_ROLE_KEY for OAuth state signing. ` +
        `Set a dedicated ${dedicatedEnvVarName} env var.`
    );
  }
  return providerSecretEnvVar || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

/**
 * Creates an HMAC-signed OAuth state parameter.
 * Format: base64url(payload).base64url(HMAC-SHA256(payload))
 *
 * @param secret   HMAC secret (from getOAuthStateSecret)
 * @param userId   Supabase user ID to embed in the state
 * @param returnTo Path to redirect to after the OAuth flow completes
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
