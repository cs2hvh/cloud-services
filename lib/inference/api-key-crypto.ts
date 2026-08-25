/**
 * Shared API key generation — factored out of app/api/inference/api-keys/route.ts
 * (the only place this logic existed before, inline) so the agent-scoped key
 * route doesn't roll a third copy. Format/hashing unchanged: 24 random bytes,
 * base64url, sliced to 32 chars; sha256 hex digest stored, never the raw key
 * (show-once pattern at the call site).
 *
 * Tier prefix (doc: manager ask 2026-07-08 — public + private key tiers,
 * mirroring Stripe's pk_/sk_ split): "private" keeps the original `ahu_live_`
 * prefix (no behavior change for existing keys/the general keys page);
 * "public" uses `ahu_pub_` so a leaked key is visually identifiable at a
 * glance as the tier that's DESIGNED to be exposed, never the other way.
 */
import { randomBytes, createHash } from "crypto";

export interface GeneratedApiKey {
  /** Plaintext key — shown to the caller exactly once, never persisted. */
  fullKey: string;
  /** First 13 chars (e.g. "ahu_live_xxxx") — safe to display/list. */
  keyPrefix: string;
  keyLastFour: string;
  /** sha256 hex digest — what's actually stored/looked up. */
  keyHash: string;
}

export function generateApiKey(tier: "private" | "public" = "private"): GeneratedApiKey {
  const random = randomBytes(24).toString("base64url").slice(0, 32);
  const fullKey = `${tier === "public" ? "ahu_pub_" : "ahu_live_"}${random}`;
  return {
    fullKey,
    keyPrefix: fullKey.slice(0, 13),
    keyLastFour: fullKey.slice(-4),
    keyHash: createHash("sha256").update(fullKey).digest("hex"),
  };
}
