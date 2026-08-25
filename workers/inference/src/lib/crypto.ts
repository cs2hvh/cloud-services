/**
 * AES-GCM symmetric encryption helpers for BYOK provider keys.
 *
 * Implementation uses the Web Crypto API (available in CF Workers
 * and modern Node 20+) so the exact same code can run in the edge
 * gateway and in the Next.js BYOK CRUD endpoints — no divergence.
 *
 * Format on disk:
 *   [12-byte IV][N-byte ciphertext+16-byte GCM tag]
 * Stored in Postgres bytea column inference.byok_keys.ciphertext.
 *
 * The DEK is a 32-byte (256-bit) random key. Generate once with:
 *   $bytes = New-Object byte[] 32
 *   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
 *   $rng.GetBytes($bytes)
 *   [Convert]::ToBase64String($bytes)
 *
 * Pass that base64 string as the BYOK_DEK env var / secret. The same
 * value must be set in Worker secrets AND the Next.js process — if
 * they diverge, encrypted keys become unreadable on one side or both.
 */

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** Cached imported DEK keyed by the base64 string so we import once per process. */
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
      return crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();
    dekCache.set(base64Dek, cached);
  }
  return cached;
}

/**
 * Encrypt a UTF-8 plaintext (e.g. an upstream API key) with AES-GCM.
 * Returns the combined IV || ciphertext+tag buffer suitable for storage.
 */
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

/**
 * Decrypt the combined IV || ciphertext+tag buffer back to plaintext.
 * Throws if the ciphertext is malformed or the DEK doesn't match.
 */
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

/** Convert base64 string to Uint8Array (Workers-safe, no Buffer). */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Convert Uint8Array to base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Postgres bytea WIRE format for an INSERT/UPDATE via PostgREST: the
 * `\x<hex>` form. Mirrors lib/inference/crypto.ts's helper of the same name
 * (Next.js side) — used when a route writes a freshly-encrypted ciphertext,
 * as opposed to postgresByteaToBytes below which reads one back.
 */
export function bytesToPostgresBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

/**
 * Postgres bytea is returned by PostgREST as a base64 string by default
 * when using the supabase-js client (transit format). This helper
 * unwraps that into a Uint8Array we can hand to decryptAesGcm.
 *
 * Some clients return bytea as a `\x...` hex string instead — we handle
 * both formats so the gateway is resilient to PostgREST version changes.
 */
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
