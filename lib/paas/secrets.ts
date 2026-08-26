/**
 * Environment variable encryption.
 *
 * AES-256-GCM with a per-project key derived from one master key by HKDF.
 * Deriving rather than storing means there is no key table to leak, no
 * bootstrap problem, and compromising one project's key does not yield
 * another's.
 *
 * THE v1 FAILURE THIS IS BUILT AGAINST
 *
 * v1's env-var decryption failed SILENTLY: a wrong or rotated key made the API
 * return the raw ciphertext JSON as the variable's value, which was then
 * written into the Kubernetes Secret and into the customer's .env download. The
 * app started with garbage in its config and nothing anywhere said why.
 *
 * GCM is authenticated, so a wrong key cannot decrypt — it throws. Nothing in
 * this module catches that and substitutes a fallback. A decrypt either returns
 * the true plaintext or raises. There is deliberately no code path that returns
 * something-shaped-like-a-value when it does not know the value.
 *
 * ON KEY LOSS: every stored env var becomes permanently unreadable. That is the
 * correct property for a secret store, and it is why the master key lives
 * outside every git repo alongside the GitHub App key and the kubeconfig.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Identifies HOW a value was encrypted, so the scheme and the master key can
 * both be rotated without guessing. Stored per row in paas.env_vars.dek_id.
 *
 * Format: `<scheme>:<masterKeyId>`. On rotation, new writes use the new id
 * while old rows stay readable until re-encrypted.
 */
const SCHEME = "v1";
const NONCE_BYTES = 12; // GCM standard
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function masterKey(): { key: Buffer; id: string } {
  const raw = process.env.V2_ENV_MASTER_KEY;
  if (!raw || !raw.trim()) {
    throw new Error(
      "[paas/secrets] V2_ENV_MASTER_KEY is not set. Refusing to encrypt or decrypt. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[paas/secrets] V2_ENV_MASTER_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        "A short key silently weakens every secret in the platform, so this is fatal rather than padded.",
    );
  }
  const id = (process.env.V2_ENV_MASTER_KEY_ID ?? "mk1").trim();
  if (!/^[a-z0-9]{1,16}$/.test(id)) {
    throw new Error(`[paas/secrets] V2_ENV_MASTER_KEY_ID "${id}" must be short lowercase alphanumerics`);
  }
  return { key, id };
}

/**
 * Per-project key. The project ref is the salt and the env var key is bound
 * into `info`, so a ciphertext lifted from one variable cannot be replayed into
 * another — the AAD alone would catch that, but binding it into the key means
 * the wrong context cannot even produce a candidate plaintext.
 */
function projectKey(master: Buffer, projectRef: string, envKey: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", master, Buffer.from(projectRef, "utf8"), Buffer.from(`paas-env-${SCHEME}:${envKey}`, "utf8"), KEY_BYTES),
  );
}

export interface EncryptedValue {
  /** nonce || ciphertext || tag. Stored in paas.env_vars.value_ct (bytea). */
  valueCt: Buffer;
  /** Stored in paas.env_vars.dek_id. */
  dekId: string;
}

/**
 * Encrypt one variable's value.
 *
 * `projectRef` and `key` are bound cryptographically, not merely stored
 * alongside. Moving a row to another project or renaming its key makes it
 * undecryptable rather than silently readable in the wrong context.
 */
export function encryptEnvValue(projectRef: string, key: string, plaintext: string): EncryptedValue {
  if (!projectRef || !key) throw new Error("[paas/secrets] projectRef and key are required");
  const { key: master, id } = masterKey();
  const dek = projectKey(master, projectRef, key);
  const nonce = randomBytes(NONCE_BYTES);

  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  // Additional authenticated data: tampering with the context is detected even
  // though the context is not itself secret.
  cipher.setAAD(Buffer.from(`${SCHEME}:${projectRef}:${key}`, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  dek.fill(0);
  return { valueCt: Buffer.concat([nonce, ct, tag]), dekId: `${SCHEME}:${id}` };
}

/**
 * Decrypt one variable's value.
 *
 * Throws on any failure. It NEVER returns ciphertext, a placeholder, or an
 * empty string as a stand-in — that is exactly how v1 shipped garbage into
 * running containers and into customers' .env downloads.
 */
export function decryptEnvValue(
  projectRef: string,
  key: string,
  valueCt: Buffer,
  dekId: string,
): string {
  const [scheme, keyId] = String(dekId).split(":");
  if (scheme !== SCHEME) {
    throw new Error(`[paas/secrets] unknown encryption scheme "${scheme}" for ${projectRef}/${key}`);
  }
  const { key: master, id: currentId } = masterKey();
  if (keyId !== currentId) {
    // Loud on purpose. Silently trying the current key against a value written
    // under another one produces an auth failure with a confusing message; this
    // says what is actually wrong.
    throw new Error(
      `[paas/secrets] ${projectRef}/${key} was encrypted under master key "${keyId}" but "${currentId}" is loaded. ` +
        "Re-encrypt under the current key or load the original.",
    );
  }

  // An EMPTY value is legitimate — `FOO=` is a thing people set — so the
  // minimum is nonce + tag with zero ciphertext bytes between them. Requiring
  // one more byte rejected every empty variable as "truncated".
  if (valueCt.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error(
      `[paas/secrets] ciphertext for ${projectRef}/${key} is truncated ` +
        `(${valueCt.length} bytes, minimum ${NONCE_BYTES + TAG_BYTES})`,
    );
  }

  const nonce = valueCt.subarray(0, NONCE_BYTES);
  const tag = valueCt.subarray(valueCt.length - TAG_BYTES);
  const ct = valueCt.subarray(NONCE_BYTES, valueCt.length - TAG_BYTES);

  const dek = projectKey(master, projectRef, key);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(Buffer.from(`${SCHEME}:${projectRef}:${key}`, "utf8"));
  decipher.setAuthTag(tag);

  try {
    const out = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    dek.fill(0);
    return out;
  } catch {
    dek.fill(0);
    // Deliberately does not include the ciphertext or any partial plaintext.
    throw new Error(
      `[paas/secrets] authentication failed decrypting ${projectRef}/${key}. ` +
        "Wrong key, or the stored value was tampered with. Refusing to return anything.",
    );
  }
}

/** PostgREST returns bytea as `\x<hex>`; Postgres accepts the same form on write. */
export function bytesToPgHex(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

export function pgHexToBytes(value: string): Buffer {
  const s = String(value);
  if (!s.startsWith("\\x")) throw new Error("[paas/secrets] expected a \\x-prefixed bytea hex string");
  return Buffer.from(s.slice(2), "hex");
}

/**
 * Constant-time comparison, for anywhere a caller-supplied secret is checked.
 * Length is compared first because timingSafeEqual throws on a mismatch.
 */
export function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
