/**
 * Exchange a validated `sk_` API key for a Supabase session belonging to that
 * key's own owner.
 *
 * WHY THIS EXISTS. v2 authorizes every tenant query by running it through the
 * caller's RLS-scoped client: PostgREST reads the caller's token, sets
 * `auth.uid()` from it, and the `paas` policies decide what is visible. A
 * browser cookie carries such a token. An API key does not — it resolves only
 * to a user id — so without this, an API key could only be served by the
 * service role plus hand-written permission checks, which is exactly the v1
 * pattern app/api/v2/_lib/auth.ts forbids (one forgotten check was a confirmed
 * cross-account bug). Handing PostgREST a real user token instead means RLS
 * keeps doing the authorization, unchanged.
 *
 * WE DO NOT SIGN TOKENS. Supabase's own auth server issues the session; this
 * module only asks for it with the service role and passes it straight to
 * PostgREST. `generateLink` generates an OTP for a custom email provider and
 * sends no mail of its own (see @supabase/auth-js GoTrueAdminApi).
 *
 * The session is the user's own identity and grants nothing they do not
 * already have — the same rows, the same policies, as when they are signed in.
 * It is held only in memory, never written down, never returned to a caller.
 */

import { createWorkerClient, createServerSupabase } from "@/lib/supabase/server";

interface CachedSession {
  accessToken: string;
  /** Epoch ms at which the token stops being usable. */
  expiresAtMs: number;
}

/**
 * Issued tokens, by user id.
 *
 * WITHOUT THIS, every API request would mint a session: three calls to the auth
 * server per request, and a new row in `auth.sessions` each time. A Supabase
 * access token lasts an hour, so reusing it turns that into roughly one
 * exchange per user per hour.
 *
 * In-process on purpose. The token is a credential; Redis would persist it
 * somewhere it can outlive the request that needed it. The web tier is a single
 * long-lived server, so a per-process map is a real cache rather than a
 * coin-flip, and a cold start simply exchanges again.
 */
const sessions = new Map<string, CachedSession>();
const MAX_CACHED = 5_000;
/** Stop reusing a token this long before it expires, so none is used mid-flight. */
const EXPIRY_MARGIN_MS = 120_000;

/** Drop a user's cached session — used when a token is rejected downstream. */
export function forgetSession(userId: string): void {
  sessions.delete(userId);
}

function cached(userId: string): string | null {
  const hit = sessions.get(userId);
  if (!hit) return null;
  if (hit.expiresAtMs - EXPIRY_MARGIN_MS <= Date.now()) {
    sessions.delete(userId);
    return null;
  }
  return hit.accessToken;
}

/**
 * A Supabase access token for `userId`, or null when one cannot be issued.
 *
 * Null rather than throwing: the caller turns it into "this key cannot be used
 * right now" without a stack trace reaching the customer. The reason is logged.
 */
export async function sessionForUser(userId: string): Promise<string | null> {
  if (!userId) return null;

  const reuse = cached(userId);
  if (reuse) return reuse;

  try {
    const admin = await createWorkerClient();

    // The email is what generateLink is keyed on. Read it here rather than
    // trusting anything from the request — the key resolved to a user id, and
    // this is the only thing that turns that id into an identity.
    const { data: found, error: lookupError } = await admin.auth.admin.getUserById(userId);
    const email = found?.user?.email;
    if (lookupError || !email) {
      console.error("[v2/api-key] no email for user; cannot issue a session:", lookupError?.message);
      return null;
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("[v2/api-key] could not generate a session token:", linkError?.message);
      return null;
    }

    // Redeemed with the ANON client: this is the ordinary sign-in exchange, and
    // doing it with the service role would not produce a user session at all.
    // persistSession is off on this client, so nothing is written to disk or to
    // a cookie — the token exists only in the value returned here.
    const anon = createServerSupabase();
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    const accessToken = verified?.session?.access_token;
    const expiresAt = verified?.session?.expires_at;
    if (verifyError || !accessToken) {
      console.error("[v2/api-key] session exchange failed:", verifyError?.message);
      return null;
    }

    // expires_at is epoch SECONDS. Falling back to a conservative 10 minutes
    // rather than assuming an hour means a missing field shortens the cache,
    // never extends it past the token's real life.
    const expiresAtMs = typeof expiresAt === "number" ? expiresAt * 1000 : Date.now() + 600_000;

    if (sessions.size >= MAX_CACHED) sessions.clear();
    sessions.set(userId, { accessToken, expiresAtMs });

    return accessToken;
  } catch (err) {
    console.error("[v2/api-key] session exchange threw:", err);
    return null;
  }
}
