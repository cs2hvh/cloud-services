/**
 * AES-256-GCM decrypt — Node 20+ uses the global crypto.subtle from
 * Web Crypto (no node:crypto import needed). Same construction as the
 * Next.js side (`lib/inference/crypto.ts`) and the edge worker
 * (`workers/inference/src/lib/crypto.ts`), so the DEK is portable
 * across all three processes.
 *
 * Ciphertext layout (matches the producers):
 *   [ IV (12 bytes) | cipher+auth tag (variable) ]
 *
 * Base64-encoded at the DB column boundary; this helper expects the
 * already-base64-decoded byte buffer.
 */

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

// Infer CryptoKey from the Web Crypto API so the tsconfig doesn't need
// to pull in the DOM / WebWorker libs. Node 20+ ships crypto.subtle
// globally; we just don't name the type.
type ImportedKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

let cachedKey: { dek: string; key: ImportedKey } | null = null;

async function importDek(base64Dek: string): Promise<ImportedKey> {
  if (cachedKey && cachedKey.dek === base64Dek) return cachedKey.key;
  const raw = Buffer.from(base64Dek, "base64");
  if (raw.byteLength !== KEY_LENGTH) {
    throw new Error(
      `BYOK_DEK must be ${KEY_LENGTH} bytes (256 bits) base64-encoded; got ${raw.byteLength} bytes`
    );
  }
  // node Buffer is a Uint8Array subclass — pass as-is.
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  cachedKey = { dek: base64Dek, key };
  return key;
}

export async function decryptAesGcm(combined: Uint8Array, base64Dek: string): Promise<string> {
  if (combined.byteLength < IV_LENGTH + 16) {
    throw new Error("Ciphertext too short to be valid AES-GCM");
  }
  const key = await importDek(base64Dek);
  const iv = combined.slice(0, IV_LENGTH);
  const cipher = combined.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}
