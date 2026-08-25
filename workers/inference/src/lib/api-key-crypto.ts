/**
 * API key generation — Workers-native counterpart to lib/inference/api-key-
 * crypto.ts (Next.js side, used by the dashboard's key-mint routes). Same
 * format/hashing, so a key minted from either side is interchangeable and
 * both produce a hash authMiddleware's sha256Hex lookup can find: 24 random
 * bytes, base64url, sliced to 32 chars; sha256 hex digest stored, never the
 * raw key. Can't import the Next.js version directly — this Worker is a
 * separate deployable with no access to the app's `lib/` tree (Node's
 * `crypto` module isn't available here either) — so this reimplements the
 * same algorithm with Web Crypto, which Workers support natively.
 */

export interface GeneratedApiKey {
  /** Plaintext key — shown to the caller exactly once, never persisted. */
  fullKey: string;
  /** First 13 chars (e.g. "ahu_live_xxxx") — safe to display/list. */
  keyPrefix: string;
  keyLastFour: string;
  /** sha256 hex digest — what's actually stored/looked up. */
  keyHash: string;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateApiKey(tier: "private" | "public" = "private"): Promise<GeneratedApiKey> {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const random = base64UrlFromBytes(randomBytes).slice(0, 32);
  const fullKey = `${tier === "public" ? "ahu_pub_" : "ahu_live_"}${random}`;
  return {
    fullKey,
    keyPrefix: fullKey.slice(0, 13),
    keyLastFour: fullKey.slice(-4),
    keyHash: await sha256Hex(fullKey),
  };
}
