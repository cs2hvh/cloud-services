/**
 * AES-GCM decrypt for registry-mode MCP auth tokens (M3, doc 14 §5).
 *
 * Same format + same DEK as lib/inference/crypto.ts / workers/inference/src/lib/crypto.ts
 * (IV(12) || ciphertext, Web Crypto API, `BYOK_DEK`) — duplicated here because
 * agent-runner is a standalone Node package with no import path into the
 * Next.js app's lib/*. agent-runner only ever DECRYPTS: the mcp-servers API
 * route (app code) is the only place a token is ever encrypted.
 */
import type { webcrypto } from "node:crypto";

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Postgres bytea wire format (`\x<hex>`), same as postgresByteaToBytes. */
function bytesFromPostgresBytea(value: string): Uint8Array {
  if (value.startsWith("\\x")) {
    const hex = value.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    return out;
  }
  return base64ToBytes(value);
}

async function importDek(base64Dek: string): Promise<webcrypto.CryptoKey> {
  const raw = base64ToBytes(base64Dek);
  if (raw.byteLength !== KEY_LENGTH) {
    throw new Error(`BYOK_DEK must be ${KEY_LENGTH} bytes (256 bits) base64-encoded; got ${raw.byteLength} bytes`);
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

/** Decrypt a registry row's `auth_token_enc` (bytea, as returned by supabase-js)
 *  back into the plaintext bearer token. Throws on malformed ciphertext or a
 *  wrong DEK — the caller (mcp-registry.ts) treats that as "skip this server". */
export async function decryptMcpToken(byteaValue: string, base64Dek: string): Promise<string> {
  const combined = bytesFromPostgresBytea(byteaValue);
  if (combined.byteLength < IV_LENGTH + 16) {
    throw new Error("mcp auth_token_enc is too short to be valid AES-GCM");
  }
  const key = await importDek(base64Dek);
  const iv = combined.slice(0, IV_LENGTH);
  const cipher = combined.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}
