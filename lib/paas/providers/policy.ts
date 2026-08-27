/**
 * Deploy policy for a normalised push, and the project lookup that goes with
 * it.
 *
 * ONE POLICY, NOT THREE. `shouldDeploy` is the GitHub module's — imported
 * rather than reimplemented, because deciding production-vs-preview in two
 * places is how two places come to disagree about what a push was. The adapter
 * does the shape work; the decision stays where it already lives and is already
 * tested.
 *
 * THE LOOKUP IS THE PART THAT HAD TO CHANGE, and it is a real collision rather
 * than tidiness. `projects.byRepoFullName(fullName)` is provider-blind, which
 * was correct while every project was GitHub. With three providers,
 * `acme/api` on GitHub and `acme/api` on GitLab are different repositories with
 * the same name — and a GitLab push would deploy the GitHub project, building
 * one customer's commit onto another customer's hostname.
 *
 * `paas.projects.provider` already exists, so the fix is to include it in the
 * predicate. Done here rather than in `lib/paas/db.ts` because that file
 * belongs to the deploy lane; they have been told the shared accessor needs the
 * same treatment.
 */

import { shouldDeploy, type PushDecision } from "../github/webhook.ts";
import type { GitProvider, ProviderPushEvent } from "./types.ts";

export type { PushDecision };

/**
 * Should this normalised push deploy, and as what?
 *
 * Delegates to the GitHub module's policy. The `installationId` it expects is
 * supplied as null: it is not read by the decision, and inventing a value would
 * put a GitHub word in a GitLab code path for no benefit.
 */
export function decidePush(event: ProviderPushEvent, productionBranch: string): PushDecision {
  return shouldDeploy(
    {
      repoFullName: event.repoFullName,
      branch: event.branch,
      sha: event.sha,
      message: event.message,
      author: event.author,
      deleted: event.deleted,
      installationId: null,
    },
    productionBranch,
  );
}

export interface ProjectRow {
  id: string;
  ref: string;
  provider: GitProvider | null;
  repo_full_name: string | null;
  production_branch: string;
}

/**
 * Find the project a push belongs to, scoped by PROVIDER as well as name.
 *
 * Returns null when nothing matches, and that is a normal outcome — a webhook
 * for a repository nobody has connected is ignored, not an error.
 *
 * AMBIGUITY IS REFUSED RATHER THAN RESOLVED. If two live projects share a
 * provider and a repo name, something is already wrong and picking one would
 * deploy a commit to whichever row sorted first. The caller reports it and
 * builds nothing.
 */
export function matchProject(
  rows: ProjectRow[],
  provider: GitProvider,
  repoFullName: string,
): { project: ProjectRow } | { project: null; ambiguous: boolean } {
  const matches = rows.filter(
    (p) =>
      p.provider === provider &&
      typeof p.repo_full_name === "string" &&
      // Provider repo names are case-insensitive in practice on all three, and
      // a push whose payload differs in case from the stored row is the same
      // repository. Matching case-sensitively would silently stop deploying.
      p.repo_full_name.toLowerCase() === repoFullName.toLowerCase(),
  );

  if (matches.length === 1) return { project: matches[0] };
  return { project: null, ambiguous: matches.length > 1 };
}
