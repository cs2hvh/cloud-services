/**
 * Server-side AES-GCM helpers for the Next.js dashboard / API routes.
 *
 * Mirrors workers/inference/src/lib/crypto.ts — same format, same DEK,
 * same Web Crypto API calls. Node 20+ exposes `crypto.subtle` natively
 * so we don't need to import 'node:crypto'.
 *
 * Used by the BYOK CRUD endpoints (app/api/inference/byok-keys/*) to
 * encrypt user-supplied upstream API keys before INSERT, and to format
 * the bytea payload for Postgres.
 */

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

const dekCache = new Map<string, Promise<CryptoKey>>();

async function importDek(base64Dek: string): Promise<CryptoKey> {
  let cached = dekCache.get(base64Dek);
  if (!cached) {
    cached = (async () => {
      const raw = base64ToBytes(base64Dek);
      if (raw.byteLength !== KEY_LENGTH) {
        throw new Error(
          `BYOK_DEK must be ${KEY_LENGTH} bytes (256 bits) base64-encoded; got ${raw.byteLength} bytes`
        );
      }
      // TS 5.7 narrows `new Uint8Array(n)` to Uint8Array<ArrayBufferLike>,
      // which crypto.subtle.importKey's BufferSource overload rejects.
      // Cast is safe — raw is a fresh ArrayBuffer-backed view.
      return crypto.subtle.importKey(
        "raw",
        raw as BufferSource,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();
    dekCache.set(base64Dek, cached);
  }
  return cached;
}

export async function encryptAesGcm(
  plaintext: string,
  base64Dek: string
): Promise<Uint8Array> {
  const key = await importDek(base64Dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(iv.byteLength + cipher.byteLength);
  out.set(iv, 0);
  out.set(cipher, iv.byteLength);
  return out;
}

export async function decryptAesGcm(
  combined: Uint8Array,
  base64Dek: string
): Promise<string> {
  if (combined.byteLength < IV_LENGTH + 16) {
    throw new Error("BYOK ciphertext is too short to be valid AES-GCM");
  }
  const key = await importDek(base64Dek);
  const iv = combined.slice(0, IV_LENGTH);
  const cipher = combined.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  return new TextDecoder().decode(plainBuf);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Postgres bytea wire format. Convert a Uint8Array into the `\x<hex>` form
 * that PostgREST INSERTs accept for bytea columns.
 */
export function bytesToPostgresBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function postgresByteaToBytes(value: string): Uint8Array {
  if (value.startsWith("\\x")) {
    const hex = value.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    }
    return out;
  }
  return base64ToBytes(value);
}
