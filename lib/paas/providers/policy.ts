/**
 * Deploy policy for a normalised push.
 *
 * ONE POLICY, NOT THREE. `shouldDeploy` is the GitHub module's — imported
 * rather than reimplemented, because deciding production-vs-preview in two
 * places is how two places come to disagree about what a push was. The adapter
 * does the shape work; the decision stays where it already lives and is already
 * tested.
 *
 * THE PROJECT LOOKUP USED TO LIVE HERE AND NO LONGER DOES.
 *
 * It was a local workaround for `projects.byRepoFullName` being provider-blind:
 * `acme/api` on GitHub and on GitLab are different repositories sharing a
 * string, so a GitLab push could deploy the GitHub project. The deploy lane
 * has since replaced the accessor outright — `projects.matchingRepo(provider,
 * fullName)` returns a list and `resolveRepoTarget` decides — so the workaround
 * is deleted rather than left beside the real thing.
 *
 * Their version is stricter than mine was, in a case I had not considered: it
 * REFUSES when handed rows from a foreign provider, instead of filtering them
 * out. If the caller forgot the provider filter then the row count is not the
 * whole population either, so subsetting what came back would be trusting a
 * query already known to be wrong.
 *
 * Their finding, not mine: this was reachable TODAY on GitHub alone. Two teams
 * may each connect the same public repository, and `[0]` from an unordered
 * query was already picking a victim. Multi-provider widened it; it did not
 * create it.
 */

import { shouldDeploy, type PushDecision } from "../github/webhook.ts";
import type { ProviderPushEvent } from "./types.ts";

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

