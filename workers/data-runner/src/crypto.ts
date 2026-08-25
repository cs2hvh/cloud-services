/**
 * Decrypt-only AES-GCM for a connector's stored source credential.
 *
 * Same format + same DEK as lib/inference/crypto.ts (IV(12) || ciphertext, Web
 * Crypto, BYOK_DEK) — duplicated here because data-runner is a standalone Node
 * package with no import path into the Next.js app's lib/*. Mirrors
 * agent-runner's mcp-crypto.ts; the runner only ever DECRYPTS (the CRUD routes
 * are the only place a credential is encrypted, since it never changes after
 * registration — unlike OAuth tokens, so no encrypt half is needed here).
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§9, Slice C3).
 */
import type { webcrypto } from "node:crypto";

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Postgres bytea wire format (`\x<hex>`, as supabase-js returns it). */
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

/** Decrypt a connector's credential_enc (bytea) back to the plaintext JSON
 *  ({access_key_id, secret_access_key}). Throws on malformed ciphertext or a
 *  wrong DEK — the caller treats that as a fail-closed sync error. */
export async function decryptCredential(byteaValue: string, base64Dek: string): Promise<string> {
  const combined = bytesFromPostgresBytea(byteaValue);
  if (combined.byteLength < IV_LENGTH + 16) {
    throw new Error("credential_enc is too short to be valid AES-GCM");
  }
  const key = await importDek(base64Dek);
  const iv = combined.slice(0, IV_LENGTH);
  const cipher = combined.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}
