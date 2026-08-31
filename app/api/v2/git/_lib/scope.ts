/**
 * Which GitHub App installations may a caller act through?
 *
 * This exists because the obvious implementation is a cross-tenant leak.
 * `listInstallations()` in lib/paas/github/app.ts returns EVERY installation
 * of the App, across every GitHub account that has ever installed it. Handing
 * that to an authenticated user would let them mint an installation token for
 * somebody else's org and list their private repositories — the same class of
 * bug as v1's confirmed IDOR, and worse, because it reaches outside the
 * platform.
 *
 * So nothing here trusts a caller-supplied installation id. An id is usable
 * only if paas.installations records it against a team the caller can see, and
 * RLS decides what that means. No membership check is written by hand here, so
 * there is none to forget.
 *
 * This previously derived the set from paas.projects.installation_id, which
 * was circular: you needed an installation to create a project, and a project
 * to authorize the installation, so a first-time connect could never happen.
 * paas.installations (2c2b8d83) records the link at callback time, before any
 * project exists, which is what breaks the cycle.
 *
 * `authenticated` holds SELECT only on that table — checked against the grants
 * rather than assumed. Writes go through paas.link_installation(), which
 * requires admin on the target team, so a client cannot claim an installation
 * by inserting a row.
 */

import type { Caller } from "../../_lib/auth";

export interface CallerInstallation {
  installationId: number;
  accountLogin: string;
  accountType: string | null;
  teamRef: string | null;
}

/**
 * Installations reachable by this caller. Empty means their teams have never
 * connected one — not that the App has no installations.
 */
export async function callerInstallations(
  caller: Caller
): Promise<CallerInstallation[]> {
  const { data, error } = await caller.db
    .from("installations")
    .select("installation_id, account_login, account_type, teams:team_id (ref)")
    .is("deleted_at", null);

  if (error || !data) return [];

  return (
    data as Array<{
      installation_id: number | string;
      account_login: string;
      account_type: string | null;
      teams: { ref: string } | null;
    }>
  ).map((row) => ({
    // installation_id is bigint, which PostgREST may return as a string.
    installationId: Number(row.installation_id),
    accountLogin: row.account_login,
    accountType: row.account_type,
    teamRef: row.teams?.ref ?? null,
  }));
}

/** Just the ids, for membership tests. */
export async function callerInstallationIds(caller: Caller): Promise<number[]> {
  const rows = await callerInstallations(caller);
  return Array.from(new Set(rows.map((r) => r.installationId)));
}

/**
 * True when the caller may act through this installation.
 *
 * Every route that accepts an installation id from the client MUST call this
 * before passing it to lib/paas/github. Treat false as 404, not 403 — a 403
 * confirms the installation exists.
 */
export async function callerMayUseInstallation(
  caller: Caller,
  installationId: number
): Promise<boolean> {
  if (!Number.isInteger(installationId) || installationId <= 0) return false;
  const ids = await callerInstallationIds(caller);
  return ids.includes(installationId);
}

/** Parse an installation id from a route param or query string. */
export function parseInstallationId(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Every git connection the caller can see, on any provider.
 *
 * `callerInstallations` above answers the GitHub question — which App
 * installations may this caller mint a token for — and coerces installation_id
 * to a Number to do it. That column is NULL for GitLab and Bitbucket, because
 * only a numeric external id can be mirrored into a bigint, so those rows come
 * back through it as installation 0. Harmless for authorization (0 matches
 * nothing) and wrong for listing, which is what this is for.
 *
 * RLS scopes the read. No membership check is written by hand here, so there is
 * none to forget.
 */
export interface CallerConnection {
  provider: "github" | "gitlab" | "bitbucket";
  /** The provider's own id. A Bitbucket workspace id is a braced UUID. */
  externalId: string;
  accountLogin: string;
  accountType: string | null;
  teamRef: string | null;
  /** Whether a usable credential is stored. GitHub never stores one. */
  hasCredential: boolean;
}

export async function callerConnections(caller: Caller): Promise<CallerConnection[]> {
  const { data, error } = await caller.db
    .from("installations")
    .select("provider, external_id, account_login, account_type, access_token_ct, teams:team_id (ref)")
    .is("deleted_at", null);

  if (error || !data) return [];

  return (
    data as Array<{
      provider: string;
      external_id: string;
      account_login: string;
      account_type: string | null;
      access_token_ct: string | null;
      teams: { ref: string } | null;
    }>
  ).map((row) => ({
    provider: row.provider as CallerConnection["provider"],
    externalId: String(row.external_id),
    accountLogin: row.account_login,
    accountType: row.account_type,
    teamRef: row.teams?.ref ?? null,
    // Presence only. The ciphertext never leaves this function.
    hasCredential: Boolean(row.access_token_ct),
  }));
}
