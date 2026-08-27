/**
 * Provider connection credentials — encryption at rest for OAuth tokens.
 *
 * WHY THIS IS NOT `secrets.ts`. That module encrypts environment variables and
 * binds each ciphertext to `(projectRef, envKey)` cryptographically: a row
 * moved to another project or renamed becomes undecryptable rather than
 * silently readable in the wrong context. That binding is the whole point of
 * it, and it is the wrong binding here.
 *
 * A connection token belongs to a TEAM's link with a provider, not to a
 * project. Reusing `encryptEnvValue` with an invented projectRef would put a
 * GitLab OAuth token in the same key space as an app's `DATABASE_URL` — and
 * would make it decryptable by anything that could name that fake project and
 * key. So this derives its own keys, in its own context, from the same master.
 *
 * WHY GITHUB DOES NOT APPEAR HERE. GitHub App installation tokens are MINTED
 * PER REQUEST from a private key and expire in an hour, so there is nothing
 * long-lived to store — `github/app.ts` holds the key and nothing else. GitLab
 * and Bitbucket are OAuth: the platform holds a refreshable token for as long
 * as the connection exists, which is a materially worse property and the reason
 * this file has to exist at all.
 *
 * That asymmetry is worth stating rather than smoothing over: connecting GitLab
 * gives us a durable credential to a customer's account. GitHub does not. A
 * breach of this table is a different severity from a breach of `env_vars`.
 *
 * ON KEY LOSS: every stored connection becomes unusable and every customer
 * re-authorises. That is the correct property, and it is why the master key
 * lives outside every git repo.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { GitProvider } from "./types.ts";

/**
 * `<scheme>:<masterKeyId>`, stored per row. Distinct from env-var ciphertexts
 * by the scheme string, so a value from one can never be fed to the other's
 * decrypt and be mistaken for a valid input.
 */
const SCHEME = "conn1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Which of a connection's two tokens a ciphertext holds. */
export type TokenKind = "access" | "refresh";

function masterKey(): { key: Buffer; id: string } {
  const raw = process.env.V2_ENV_MASTER_KEY;
  if (!raw || !raw.trim()) {
    throw new Error(
      "[paas/providers/credentials] V2_ENV_MASTER_KEY is not set. Refusing to encrypt or decrypt a connection token.",
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[paas/providers/credentials] V2_ENV_MASTER_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        "A short key silently weakens every credential in the platform, so this is fatal rather than padded.",
    );
  }
  const id = (process.env.V2_ENV_MASTER_KEY_ID ?? "mk1").trim();
  if (!/^[a-z0-9]{1,16}$/.test(id)) {
    throw new Error(`[paas/providers/credentials] V2_ENV_MASTER_KEY_ID "${id}" must be short lowercase alphanumerics`);
  }
  return { key, id };
}

/**
 * Per-connection, per-token-kind key.
 *
 * The provider and external id are the salt; the token kind is bound into
 * `info`. So an access token's ciphertext cannot be replayed into the refresh
 * column, and a GitLab project 42's token cannot be replayed into a GitHub
 * installation 42's — the numeric collision between providers that
 * `link_installation` also guards against, closed here cryptographically as
 * well as by a unique key.
 */
function connectionKey(master: Buffer, provider: GitProvider, externalId: string, kind: TokenKind): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      master,
      Buffer.from(`${provider}:${externalId}`, "utf8"),
      Buffer.from(`paas-conn-${SCHEME}:${kind}`, "utf8"),
      KEY_BYTES,
    ),
  );
}

export interface EncryptedToken {
  /** nonce || ciphertext || tag. Stored as bytea. */
  tokenCt: Buffer;
  /** Stored alongside, so scheme and master key can both rotate. */
  dekId: string;
}

export function encryptConnectionToken(
  provider: GitProvider,
  externalId: string,
  kind: TokenKind,
  plaintext: string,
): EncryptedToken {
  if (!externalId) throw new Error("[paas/providers/credentials] externalId is required");
  if (!plaintext) throw new Error("[paas/providers/credentials] refusing to encrypt an empty token");

  const { key: master, id } = masterKey();
  const dek = connectionKey(master, provider, externalId, kind);
  const nonce = randomBytes(NONCE_BYTES);

  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  // The context is not secret, but tampering with it is detected.
  cipher.setAAD(Buffer.from(`${SCHEME}:${provider}:${externalId}:${kind}`, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  dek.fill(0);
  return { tokenCt: Buffer.concat([nonce, ct, tag]), dekId: `${SCHEME}:${id}` };
}

/**
 * Decrypt a connection token.
 *
 * THROWS on any failure and never returns a placeholder. v1's env decryption
 * returned raw ciphertext when the key was wrong, which was then written into
 * running containers; the equivalent here would be sending a ciphertext blob to
 * GitLab as a bearer token — a 401 that looks like an expired connection and
 * sends someone to re-authorise a customer for no reason.
 */
export function decryptConnectionToken(
  provider: GitProvider,
  externalId: string,
  kind: TokenKind,
  tokenCt: Buffer,
  dekId: string,
): string {
  const [scheme, keyId] = String(dekId).split(":");
  if (scheme !== SCHEME) {
    throw new Error(
      `[paas/providers/credentials] unknown scheme "${scheme}" for ${provider}/${externalId} — ` +
        `env-var ciphertexts use a different scheme and cannot be read here`,
    );
  }
  const { key: master, id } = masterKey();
  if (keyId !== id) {
    throw new Error(
      `[paas/providers/credentials] ${provider}/${externalId} was encrypted under master key "${keyId}" ` +
        `but "${id}" is configured. Refusing to guess.`,
    );
  }
  if (tokenCt.length <= NONCE_BYTES + TAG_BYTES) {
    throw new Error(`[paas/providers/credentials] ciphertext for ${provider}/${externalId} is too short to be valid`);
  }

  const nonce = tokenCt.subarray(0, NONCE_BYTES);
  const tag = tokenCt.subarray(tokenCt.length - TAG_BYTES);
  const body = tokenCt.subarray(NONCE_BYTES, tokenCt.length - TAG_BYTES);

  const dek = connectionKey(master, provider, externalId, kind);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(Buffer.from(`${SCHEME}:${provider}:${externalId}:${kind}`, "utf8"));
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/**
 * Is this token close enough to expiry to refresh before using?
 *
 * A token that expires mid-build fails the clone rather than the API call that
 * checked it, so the margin is generous: better to refresh one time too often
 * than to hand a build VM a credential with ninety seconds left.
 *
 * Null expiry means the provider did not say. Treated as NEEDING refresh rather
 * than as never-expiring — an unknown lifetime that turns out to be short fails
 * in the build, and one that turns out to be long costs a refresh call.
 */
export function needsRefresh(expiresAt: string | Date | null, now: Date = new Date(), marginSeconds = 300): boolean {
  if (expiresAt === null) return true;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  if (!Number.isFinite(t)) return true;
  return t - now.getTime() <= marginSeconds * 1000;
}

/**
 * Redact a token for logging.
 *
 * Exists so there is an obvious right way to do it. Every provider token in
 * this system is a bearer credential to a customer's source code, and the
 * common way they leak is an error message that interpolated one.
 */
export function redactToken(token: string): string {
  if (!token) return "(empty)";
  return token.length <= 8 ? "(redacted)" : `${token.slice(0, 4)}…${token.slice(-2)} (${token.length} chars)`;
}
