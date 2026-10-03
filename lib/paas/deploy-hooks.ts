/**
 * Deploy hook tokens.
 *
 * A deploy hook is a secret URL: POST to it and the app's production branch
 * deploys. Possession of the URL IS the authorization, so the token is the only
 * thing standing between a stranger and a build machine — it carries 256 bits
 * of randomness and is never stored.
 *
 * WHAT IS PERSISTED is a sha256 of the token and its last four characters. The
 * hash is safe to keep because nothing ever accepts a hash: the trigger route
 * hashes what it is given, so a leaked hash is useful only to someone who can
 * find a preimage of it. The hint exists so a person looking at a list of hooks
 * can tell which one their CI is using without the list holding the secret.
 *
 * NO PATH ALIASES AND NO JSX, deliberately. The trigger route imports this, and
 * so may the build worker one day; worker-runtime.test.ts fails the build if the
 * worker's import graph ever reaches `@/…` or a `.tsx` file.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** `dh_` + 43 characters of base64url — 32 random bytes, unpadded. */
const TOKEN_PATTERN = /^dh_[A-Za-z0-9_-]{43}$/;

export interface MintedHookToken {
  /** The secret. Shown to the person once, then never again. */
  token: string;
  /** sha256 hex of the token. This is what is stored. */
  hash: string;
  /** Last four characters, for telling hooks apart in a list. */
  hint: string;
}

/** Hash a token the way it is stored. */
export function hashHookToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Cheap shape check before any database lookup.
 *
 * Not a security control — a malformed token would simply find no row. It keeps
 * random traffic at the public endpoint from costing a query each.
 */
export function isWellFormedHookToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function mintHookToken(): MintedHookToken {
  const token = `dh_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashHookToken(token), hint: token.slice(-4) };
}

/**
 * Compare two stored-form hashes without leaking where they differ.
 *
 * The lookup is by hash, so a match is already exact; this exists for callers
 * that hold a hash from elsewhere and must not short-circuit on the first byte.
 */
export function hookHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The URL a customer stores in their CI. */
export function deployHookUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/v2/hooks/deploy/${token}`;
}
