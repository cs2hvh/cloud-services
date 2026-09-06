/**
 * The one path that records a git-provider connection.
 *
 * WHY THIS RUNS WITH THE SERVICE ROLE, in a tree whose rule is that request
 * handlers never do. Ownership of a GitHub App installation, a GitLab account
 * or a Bitbucket workspace is a fact about the PROVIDER, and RLS cannot see
 * providers. The callback routes prove it first, each in the only way its
 * provider allows:
 *
 *   GitHub     the signed-in identity's GitHub login equals the account the
 *              installation is on (lib/paas/github/ownership.ts);
 *   GitLab,
 *   Bitbucket  the OAuth token the provider just issued to this browser names
 *              the account, and the tokens travel in the same call.
 *
 * Until 2026-09-06 the write itself did not require that proof. authenticated
 * held INSERT on paas.installations, and paas.link_installation was a
 * SECURITY DEFINER function any client could call from PostgREST: both let a
 * customer skip the callback and claim an installation id they guessed, and
 * the row IS the authorization every later route reads. A live test claimed
 * 999999999 with one request. So the write moved behind
 * paas.link_installation_verified, executable by service_role only and taking
 * the acting user as an argument. It re-checks that the user administers the
 * target team; the route's proof is what makes it safe to call at all.
 *
 * lib/paas/boundary.test.ts allowlists exactly the four callback routes for
 * this import, each with its reason. Anything else importing this file is
 * asserting it ran a provider-side ownership proof, and the test will ask.
 */

import { db, DbError } from "../db.ts";

export type GitProvider = "github" | "gitlab" | "bitbucket";

export interface VerifiedLink {
  /** The signed-in user the calling route resolved with getUser(). */
  userId: string;
  provider: GitProvider;
  /** GitHub installation id, GitLab user id, or Bitbucket workspace uuid. */
  externalId: string;
  teamRef: string;
  /** The account the proof matched. Blank means no proof ran, and is refused. */
  accountLogin: string;
  accountType: string | null;
  metadata?: Record<string, unknown>;
  /** PostgREST bytea: hex with a `\x` prefix, as the OAuth callbacks build it. */
  accessTokenCt?: string | null;
  refreshTokenCt?: string | null;
  tokenDekId?: string | null;
  tokenExpiresAt?: string | null;
}

/** SQLSTATE when PostgREST reported one (`23505` for "held by another team"). */
export interface LinkError {
  code: string;
  message: string;
}

export async function linkVerifiedInstallation(
  input: VerifiedLink,
): Promise<{ error: LinkError | null }> {
  if (!input.userId) {
    return { error: { code: "no_user", message: "no acting user" } };
  }
  if (!input.accountLogin.trim()) {
    return {
      error: { code: "no_account", message: "no account login: ownership was not proven" },
    };
  }
  try {
    await db.rpc<string>("link_installation_verified", {
      p_user_id: input.userId,
      p_provider: input.provider,
      p_external_id: input.externalId,
      p_team_ref: input.teamRef,
      p_account_login: input.accountLogin,
      p_account_type: input.accountType,
      p_metadata: input.metadata ?? {},
      p_access_token_ct: input.accessTokenCt ?? null,
      p_refresh_token_ct: input.refreshTokenCt ?? null,
      p_token_dek_id: input.tokenDekId ?? null,
      p_token_expires_at: input.tokenExpiresAt ?? null,
    });
    return { error: null };
  } catch (e) {
    return { error: toLinkError(e) };
  }
}

/**
 * PostgREST answers a raised exception with `{code, message, details, hint}`
 * where code is the SQLSTATE. Kept separate so the callbacks can keep their
 * existing "23505 means another team holds it" branch unchanged.
 */
export function toLinkError(e: unknown): LinkError {
  if (e instanceof DbError) {
    try {
      const body = JSON.parse(e.body) as { code?: unknown; message?: unknown };
      return {
        code: typeof body.code === "string" ? body.code : String(e.status),
        message: typeof body.message === "string" ? body.message : e.message,
      };
    } catch {
      return { code: String(e.status), message: e.message };
    }
  }
  return { code: "unknown", message: e instanceof Error ? e.message : String(e) };
}
