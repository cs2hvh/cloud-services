/**
 * Best-effort CF KV write-through from the Next.js control plane.
 *
 * When a guardrail policy or prompt version is published, the control plane
 * writes the new value to CF KV so the Worker sees it within one TTL (5 min)
 * instead of waiting for the next cold KV read. If the CF REST API call fails
 * (missing env vars, network error, etc.) the Worker will still work — it gets
 * a KV miss and falls back to its safe defaults. Never throws.
 *
 * Required env vars (set in Next.js .env):
 *   CF_ACCOUNT_ID         — Cloudflare account ID
 *   CF_API_TOKEN          — token with KV:Edit permission
 *   CF_GUARDRAILS_KV_ID   — GUARDRAILS namespace ID from wrangler.toml
 *   CF_PROMPTS_KV_ID      — PROMPTS namespace ID from wrangler.toml
 */

const CF_BASE = "https://api.cloudflare.com/client/v4";

function cfCredentials(): { accountId: string; token: string } | null {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) return null;
  return { accountId, token };
}

async function kvPut(
  namespaceId: string,
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<void> {
  const creds = cfCredentials();
  if (!creds || !namespaceId) return;
  const url = `${CF_BASE}/accounts/${creds.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}?expiration_ttl=${ttlSeconds}`;
  try {
    await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
  } catch {
    // Non-fatal — Worker will get a KV miss and serve from defaults
  }
}

async function kvDelete(namespaceId: string, key: string): Promise<void> {
  const creds = cfCredentials();
  if (!creds || !namespaceId) return;
  const url = `${CF_BASE}/accounts/${creds.accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  try {
    await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${creds.token}` },
    });
  } catch {
    // Non-fatal
  }
}

// ─── Guardrail policies ───────────────────────────────────────────────────────

/** Write a guardrail policy to KV. Key: "guardrail:{orgId}:{name}" */
export async function kvPutGuardrailPolicy(
  orgId: string,
  name: string,
  policy: { name: string; mode: string; rules: unknown[] }
): Promise<void> {
  await kvPut(process.env.CF_GUARDRAILS_KV_ID ?? "", `guardrail:${orgId}:${name}`, policy);
}

/** Invalidate a guardrail policy from KV (on delete). */
export async function kvDeleteGuardrailPolicy(
  orgId: string,
  name: string
): Promise<void> {
  await kvDelete(process.env.CF_GUARDRAILS_KV_ID ?? "", `guardrail:${orgId}:${name}`);
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

/** Write a prompt version to KV. Key: "prompt:{orgId}:{name}:{label}" */
export async function kvPutPrompt(
  orgId: string,
  name: string,
  label: string,
  payload: {
    promptId: string;
    version: number;
    template: Array<{ role: string; content: string }>;
    modelDefaults: Record<string, unknown>;
  }
): Promise<void> {
  await kvPut(process.env.CF_PROMPTS_KV_ID ?? "", `prompt:${orgId}:${name}:${label}`, payload);
}

/**
 * Invalidate a prompt label from KV (on label reassignment or prompt delete).
 * Call on every label that was active for the deleted prompt.
 */
export async function kvDeletePrompt(
  orgId: string,
  name: string,
  label: string
): Promise<void> {
  await kvDelete(process.env.CF_PROMPTS_KV_ID ?? "", `prompt:${orgId}:${name}:${label}`);
}
