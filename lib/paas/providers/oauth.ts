/**
 * OAuth state, and the identity check that makes a callback safe to act on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT THE DEPLOY LANE'S RULE 2 BECOMES FOR OAUTH.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Their rule, learned on the GitHub callback: VERIFY THE INSTALLATION WITH THE
 * PROVIDER BEFORE WRITING A ROW, because the id arrives on a URL anyone can
 * type, and without the check a caller claims any installation and gains deploy
 * access to a stranger's repositories.
 *
 * OAuth moves the danger rather than removing it. There is no guessable
 * installation id — a `code` cannot be invented, and exchanging one proves the
 * user authorised us. So the identity half is inherent, PROVIDED the identity
 * is read from the exchange and never from the URL. Two rules follow:
 *
 *   1. THE ACCOUNT COMES FROM THE TOKEN, NOT THE QUERY STRING. Call the
 *      provider with the new token and ask who it belongs to. A callback that
 *      trusts `?account=` writes whatever the caller typed, which is the
 *      original bug in a different costume.
 *
 *   2. STATE IS THE OTHER HALF, AND IT IS THE ONE OAUTH ADDS. Without it, an
 *      attacker starts an authorisation with their OWN provider account and
 *      tricks a victim into completing it against the victim's team — the
 *      victim's projects then deploy from the attacker's repositories, and
 *      every build runs code the attacker controls. The reverse is worse: the
 *      victim's account linked to the attacker's team hands over their private
 *      source.
 *
 * State is therefore SIGNED, not merely random-and-stored: it carries the team
 * it was minted for, so a callback cannot be replayed against a different team
 * even by the user who started it. It expires, because an authorisation URL
 * left in a browser for a week is a live capability. And it is compared in
 * constant time, because a byte-by-byte early return leaks the signing key.
 *
 * Pure apart from the identity calls, which take a fetch-shaped function so the
 * decisions are testable without a network.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GitProvider } from "./types.ts";

/** How long an authorisation may sit half-finished before it stops working. */
export const STATE_TTL_SECONDS = 600;

function signingKey(): Buffer {
  const raw = process.env.V2_ENV_MASTER_KEY;
  if (!raw || !raw.trim()) {
    throw new Error(
      "[paas/providers/oauth] V2_ENV_MASTER_KEY is not set. Refusing to mint or verify OAuth state — " +
        "an unsigned state parameter is no state parameter at all.",
    );
  }
  // A distinct HKDF-ish context so this key cannot be confused with the one
  // encrypting connection tokens, even though both derive from the same master.
  return createHmac("sha256", Buffer.from(raw.trim(), "base64")).update("paas-oauth-state-v1").digest();
}

export interface StatePayload {
  provider: GitProvider;
  /** The team the connection will be bound to. */
  teamRef: string;
  /** Unix seconds. */
  issuedAt: number;
  /** Defeats replay of an otherwise identical state. */
  nonce: string;
}

/**
 * Mint a signed state parameter.
 *
 * Format: `base64url(payload).base64url(hmac)`. The payload is readable — it
 * carries no secret, only the team ref the user already knows — and the
 * signature is what makes it unforgeable.
 */
export function mintState(provider: GitProvider, teamRef: string, now: Date = new Date()): string {
  if (!teamRef) throw new Error("[paas/providers/oauth] teamRef is required to mint state");
  const payload: StatePayload = {
    provider,
    teamRef,
    issuedAt: Math.floor(now.getTime() / 1000),
    nonce: randomBytes(12).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export type StateResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "missing" | "malformed" | "bad-signature" | "expired" | "provider-mismatch" };

/**
 * Verify a state parameter and return what it was minted for.
 *
 * `expectedProvider` is checked rather than trusted from the payload: a state
 * minted for GitLab and replayed on the Bitbucket callback would otherwise
 * bind a Bitbucket account under a GitLab authorisation, and the signature
 * alone cannot notice because it is a genuine state we issued.
 */
export function verifyState(
  state: string | null,
  expectedProvider: GitProvider,
  now: Date = new Date(),
): StateResult {
  if (!state) return { ok: false, reason: "missing" };

  const dot = state.indexOf(".");
  if (dot <= 0 || dot === state.length - 1) return { ok: false, reason: "malformed" };
  const body = state.slice(0, dot);
  const provided = state.slice(dot + 1);

  const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Length is public; a differing length cannot match and timingSafeEqual
  // throws rather than returning false on one.
  if (a.length !== b.length) return { ok: false, reason: "bad-signature" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    // Signed but unparseable. Cannot happen from a state we minted, so it means
    // the signing key was reused for something else — worth its own reason.
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload?.teamRef !== "string" || typeof payload?.issuedAt !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.provider !== expectedProvider) return { ok: false, reason: "provider-mismatch" };

  const age = Math.floor(now.getTime() / 1000) - payload.issuedAt;
  // Negative age is a clock disagreement, not a state from the future. Refused
  // rather than accepted, because accepting it makes the TTL unbounded for
  // anyone who can skew a clock.
  if (age < 0 || age > STATE_TTL_SECONDS) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}

// ── the identity half ───────────────────────────────────────────────────────

export interface ConnectionIdentity {
  /** Provider-side id, as text. Numeric on GitLab, a UUID on Bitbucket. */
  externalId: string;
  /** The account name stored in installations.account_login. */
  accountLogin: string;
  /** `user`, `group`, `workspace` — provider's own word. */
  accountType: string | null;
}

/**
 * The subset of `fetch` these modules use, injected so decisions are testable
 * without a network.
 *
 * `method` and `body` are here because the refresh flow POSTs — a
 * headers-only shape forced a cast at that call site, and a cast is how a
 * mistyped body reaches a token endpoint unnoticed.
 */
export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/**
 * Who does this GitLab token belong to?
 *
 * Read from `/user` with the token itself. Nothing here accepts an identity
 * from the caller, which is the whole point — the token is the only thing that
 * can answer, and it answers for exactly one account.
 */
export async function gitlabIdentity(host: string, token: string, fetcher: Fetcher): Promise<ConnectionIdentity> {
  const res = await fetcher(`${host.replace(/\/+$/, "")}/api/v4/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`[paas/providers/oauth] gitlab identity -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const u = (await res.json()) as { id?: unknown; username?: unknown };
  if (typeof u?.id !== "number" || typeof u?.username !== "string" || !u.username) {
    throw new Error("[paas/providers/oauth] gitlab /user returned no usable identity — refusing to link");
  }
  return { externalId: String(u.id), accountLogin: u.username, accountType: "user" };
}

/**
 * Which workspace does this Bitbucket token grant?
 *
 * `/workspaces` rather than `/user`, because a Bitbucket connection is scoped
 * to a workspace and the repositories hang off it. A token with access to
 * exactly one workspace is the supported case; more than one is ambiguous and
 * refused rather than guessed — picking the first would silently bind whichever
 * the API happened to order first, and that ordering is not stable.
 */
export async function bitbucketIdentity(token: string, fetcher: Fetcher): Promise<ConnectionIdentity> {
  const res = await fetcher("https://api.bitbucket.org/2.0/workspaces?role=member&pagelen=100", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`[paas/providers/oauth] bitbucket identity -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { values?: Array<{ uuid?: unknown; slug?: unknown }> };
  const values = Array.isArray(body?.values) ? body.values : [];

  if (values.length === 0) {
    throw new Error("[paas/providers/oauth] bitbucket token grants no workspace — refusing to link");
  }
  if (values.length > 1) {
    throw new Error(
      `[paas/providers/oauth] bitbucket token grants ${values.length} workspaces. Refusing to guess which one ` +
        `this connection is for — the caller must name it.`,
    );
  }

  const ws = values[0];
  if (typeof ws?.uuid !== "string" || typeof ws?.slug !== "string" || !ws.slug) {
    throw new Error("[paas/providers/oauth] bitbucket workspace has no usable identity — refusing to link");
  }
  // The UUID is the identity; the slug is renameable and is stored only as the
  // display name. A connection keyed on a slug silently detaches on rename.
  return { externalId: ws.uuid, accountLogin: ws.slug, accountType: "workspace" };
}

// ── token exchange ──────────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** ISO string, or null when the provider did not say. */
  expiresAt: string | null;
}

/**
 * Read a token response into the shape we store.
 *
 * Shared because both providers return RFC 6749 fields and both can omit
 * `expires_in`. A missing expiry becomes null rather than a far-future date —
 * `needsRefresh` treats null as "refresh before use", which costs one call and
 * cannot strand a build with a dead credential.
 */
export function parseTokenResponse(body: unknown, now: Date = new Date()): TokenSet {
  if (typeof body !== "object" || body === null) {
    throw new Error("[paas/providers/oauth] token response was not an object");
  }
  const b = body as Record<string, unknown>;

  // An OAuth error arrives with HTTP 200 often enough that the body must be
  // checked rather than only the status.
  if (typeof b.error === "string") {
    const desc = typeof b.error_description === "string" ? `: ${b.error_description}` : "";
    throw new Error(`[paas/providers/oauth] token exchange refused (${b.error})${desc}`);
  }
  if (typeof b.access_token !== "string" || !b.access_token) {
    throw new Error("[paas/providers/oauth] token response carried no access_token");
  }

  const expiresIn = typeof b.expires_in === "number" && Number.isFinite(b.expires_in) ? b.expires_in : null;

  return {
    accessToken: b.access_token,
    refreshToken: typeof b.refresh_token === "string" && b.refresh_token ? b.refresh_token : null,
    expiresAt: expiresIn === null ? null : new Date(now.getTime() + expiresIn * 1000).toISOString(),
  };
}
