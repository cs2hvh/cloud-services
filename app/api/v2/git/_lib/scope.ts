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
 * only if it already appears on a project the caller can see, and RLS decides
 * what that means. The lookup is a plain select against paas.projects through
 * the RLS-scoped client: no membership check written by hand, nothing to
 * forget.
 *
 * KNOWN GAP — first-time connect is not covered by this.
 * Linking a *new* installation to a team requires a record written at install
 * time (GitHub redirects back with ?installation_id= and we know who the
 * caller is at that moment). paas has nowhere to put it: projects.installation_id
 * only exists once a project does, which is circular. A paas.installations
 * table keyed (installation_id, team_id) is needed, and supabase/migrations is
 * not this lane. Requested from the deploy-v2 session; until it lands,
 * first-time connect returns notEnabled() rather than falling back to the
 * unscoped list.
 */

import type { Caller } from "../../_lib/auth";

/**
 * Installation ids reachable by this caller, derived from their projects.
 * Empty means they have never connected a repo — not that the App has no
 * installations.
 */
export async function callerInstallationIds(caller: Caller): Promise<number[]> {
  const { data, error } = await caller.db
    .from("projects")
    .select("installation_id")
    .not("installation_id", "is", null)
    .is("deleted_at", null);

  if (error || !data) return [];

  const ids = (data as Array<{ installation_id: number | null }>)
    .map((row) => row.installation_id)
    .filter((id): id is number => typeof id === "number");

  return Array.from(new Set(ids));
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
