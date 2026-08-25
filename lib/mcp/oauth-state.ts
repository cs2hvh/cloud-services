/**
 * Signed, encrypted `state` parameter for the MCP OAuth authorize→callback
 * round-trip (doc 14 §10 decision #2).
 *
 * Next.js API routes are stateless per-request, and the customer's browser
 * leaves our site entirely during the provider's consent screen — so the PKCE
 * code_verifier (which must survive from the authorize request to the
 * callback request) can't live in server memory or a normal session. Rather
 * than add a new ephemeral DB table just to hold one short-lived value, it
 * rides inside the OAuth `state` param itself: AES-GCM encrypted (so a
 * customer can't read or forge it) with an embedded expiry (so a stale/replayed
 * callback is rejected), using the same DEK + cipher every other credential
 * in this codebase already uses.
 */
import { encryptAesGcm, decryptAesGcm, bytesToPostgresBytea, postgresByteaToBytes } from "@/lib/inference/crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real consent click, short enough to bound replay risk

export interface McpOAuthState {
  serverId: string;
  orgId: string;
  codeVerifier: string;
  /** The user who clicked "Connect" — carried through so the callback route
   *  (which has no session of its own, see its file header) can still audit
   *  the resulting connection against a real actor instead of leaving it
   *  attributionless. */
  userId: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeOAuthState(state: McpOAuthState, dek: string): Promise<string> {
  const payload = JSON.stringify({ ...state, iat: Date.now() });
  const encrypted = await encryptAesGcm(payload, dek);
  return toBase64Url(encrypted);
}

/** Throws on a malformed/forged/expired state — the caller treats any of
 *  those as a rejected callback (400), never a silent pass-through. */
export async function decodeOAuthState(encoded: string, dek: string): Promise<McpOAuthState> {
  const bytes = fromBase64Url(encoded);
  const plaintext = await decryptAesGcm(bytes, dek);
  const parsed = JSON.parse(plaintext) as McpOAuthState & { iat: number };
  if (typeof parsed.iat !== "number" || Date.now() - parsed.iat > STATE_TTL_MS) {
    throw new Error("OAuth state expired — the authorization flow took too long, please retry");
  }
  if (!parsed.serverId || !parsed.orgId || !parsed.codeVerifier || !parsed.userId) {
    throw new Error("OAuth state missing required fields");
  }
  return { serverId: parsed.serverId, orgId: parsed.orgId, codeVerifier: parsed.codeVerifier, userId: parsed.userId };
}

// Re-exported so callers don't need a second import from lib/inference/crypto
// just for the two bytea helpers used alongside this module.
export { bytesToPostgresBytea, postgresByteaToBytes };
