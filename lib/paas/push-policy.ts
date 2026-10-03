/**
 * Whether a git push should deploy, given the app's own settings.
 *
 * WHY THIS EXISTS. A deploy hook lets a customer's CI deploy only after their
 * tests pass — but only if a push to the production branch is not ALSO
 * deploying on its own. Without a way to turn that off, the push went straight
 * to production before the tests ran, and the hook then deployed a second time:
 * it gated nothing. `deploy_on_push = false` makes the hook (or the dashboard's
 * Deploy button) the only way to production.
 *
 * PREVIEWS ARE UNAFFECTED, on purpose. A team gating production on CI still
 * wants a preview URL for every branch; that is the half of push-to-deploy
 * nobody needs to switch off.
 *
 * ONE FUNCTION FOR ALL THREE PROVIDERS, so GitHub, GitLab and Bitbucket cannot
 * drift into three slightly different rules.
 *
 * No path aliases or JSX: this sits in lib/paas and may be imported by the
 * worker one day (see worker-runtime.test.ts).
 */

export interface PushPolicyProject {
  /**
   * Absent or null means ON. An app created before the setting existed, or a
   * read that did not select the column, must deploy exactly as it always has —
   * failing the other way would silently stop production deploys.
   */
  deploy_on_push?: boolean | null;
}

export type PushKind = "production" | "preview";

export function pushDeploys(kind: PushKind, project: PushPolicyProject): boolean {
  if (kind === "preview") return true;
  return project.deploy_on_push !== false;
}

/** What the webhook answers when it declines, so the reason is visible in the provider's delivery log. */
export const PUSH_DEPLOY_OFF_REASON =
  "deploy on push is off for this app's production branch; production deploys come from a deploy hook or the dashboard";
