/**
 * Which project does a push belong to?
 *
 * `repo_full_name` is not unique and never was. Two teams may each connect the
 * same public repository, and with three git providers `acme/api` on GitLab and
 * `acme/api` on GitHub are different repositories that share a string. The
 * lookup that answered this took the first row it happened to get back.
 *
 * "First row" from an unordered query is arbitrary, and arbitrary here means
 * building one customer's commit onto another customer's hostname. It is not a
 * failure anyone would see: the deploy succeeds, the wrong site changes, and
 * the customer who actually pushed sees nothing happen.
 *
 * SO AMBIGUITY REFUSES RATHER THAN RESOLVES. There is no tie-break that is
 * right — most-recent, lowest-id, first-created all pick a victim. Declining to
 * deploy loses a deploy, which the customer notices and reports; picking wrong
 * corrupts a site belonging to someone who was not involved.
 */

import type { ProjectRow } from "./db.ts";

export type RepoTarget =
  /** Exactly one live project owns this repo on this provider. */
  | { kind: "one"; project: ProjectRow }
  /** Nobody has connected it. Normal — we receive pushes for repos we do not build. */
  | { kind: "none"; reason: string }
  /** More than one. Deliberately not deployed. */
  | { kind: "ambiguous"; reason: string; refs: string[] };

/**
 * Decide which project a push targets, given every live project matching the
 * repository AND provider.
 *
 * The provider filter belongs in the query, not here — this cannot check what
 * it was not given. It does assert the rows it receives agree on the provider,
 * because a caller that forgot the filter would otherwise get a confident
 * single answer spanning two providers, which is the exact bug this exists to
 * stop.
 */
export function resolveRepoTarget(matches: readonly ProjectRow[], fullName: string, provider: string): RepoTarget {
  if (matches.length === 0) {
    return { kind: "none", reason: `no project for ${provider}:${fullName}` };
  }

  const foreign = matches.filter((p) => p.provider !== provider);
  if (foreign.length > 0) {
    // The caller's query was not provider-scoped. Refuse rather than trust the
    // subset that happens to match — if the filter is missing, the row count is
    // not the whole population either.
    return {
      kind: "ambiguous",
      reason: `lookup for ${provider}:${fullName} returned rows from other providers (${[...new Set(foreign.map((p) => p.provider))].join(", ")}) — the query is not provider-scoped`,
      refs: matches.map((p) => p.ref),
    };
  }

  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      reason: `${matches.length} live projects claim ${provider}:${fullName} — refusing to guess which one this push belongs to`,
      refs: matches.map((p) => p.ref),
    };
  }

  return { kind: "one", project: matches[0] };
}
