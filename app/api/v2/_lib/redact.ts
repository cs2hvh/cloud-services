/**
 * INTERIM build-log redaction. DELETE THIS FILE when app-deploy-3 ships the
 * tested sanitiser in lib/paas/telemetry/ — this is a stopgap, not a second
 * implementation to maintain. Two sanitisers with different rules is the
 * outcome we agreed to avoid.
 *
 * Why it exists at all: build logs can contain a live GitHub credential.
 * buildCloneUrl() in lib/paas/github/client.ts returns
 *
 *     https://x-access-token:<installation-token>@github.com/<owner>/<repo>.git
 *
 * and lib/paas/build/vm.ts passes that straight to `git clone`. The build
 * script does not echo it deliberately and does not run under `set -x`, but
 * git's own stderr on a failed clone can include the remote URL, and nothing
 * downstream removed it: there is no redaction in vm.ts or r2.ts, and the log
 * route served whatever R2 held.
 *
 * The token is scoped to one repo, read-only, and expires in an hour. That
 * bounds the damage; it does not make it acceptable to hand to every team
 * member who opens a build log.
 *
 * Deliberately conservative. It over-redacts rather than risk a miss, and it
 * never tries to be clever about context — a string that looks like a
 * credential is treated as one.
 */

const PLACEHOLDER = "[redacted]";

const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // The clone URL, whole. Keeps the host and path so the log still reads.
  {
    re: /https:\/\/x-access-token:[^@\s]+@/gi,
    replace: `https://x-access-token:${PLACEHOLDER}@`,
  },
  // Any userinfo in a URL, not just GitHub's.
  { re: /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, replace: `$1${PLACEHOLDER}@` },
  // GitHub token families, wherever they appear loose in the text.
  { re: /\bghs_[A-Za-z0-9]{20,}/g, replace: PLACEHOLDER },
  { re: /\bghp_[A-Za-z0-9]{20,}/g, replace: PLACEHOLDER },
  { re: /\bgho_[A-Za-z0-9]{20,}/g, replace: PLACEHOLDER },
  { re: /\bghu_[A-Za-z0-9]{20,}/g, replace: PLACEHOLDER },
  { re: /\bghr_[A-Za-z0-9]{20,}/g, replace: PLACEHOLDER },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replace: PLACEHOLDER },
  // Authorization headers, if a build step ever curls with one.
  {
    re: /\b(authorization\s*:\s*)(bearer|token|basic)\s+\S+/gi,
    replace: `$1$2 ${PLACEHOLDER}`,
  },
  // AWS/R2 style keys, since the publisher step touches object storage.
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: PLACEHOLDER },
  // Presigned R2 URLs. Found by app-deploy-3, and the worst thing in this
  // list: presign() in lib/paas/build/r2.ts puts X-Amz-Credential and
  // X-Amz-Signature in the QUERY STRING, and vm.ts passes the result to curl
  // on the command line. That signature grants write to the image tar for an
  // hour — whoever holds it can replace the artefact that gets deployed,
  // which is exactly the capability the throwaway-build-VM design exists to
  // withhold. It is not userinfo, so the URL pattern above does not catch it.
  { re: /([?&]X-Amz-Signature=)[^&\s'"]+/gi, replace: `$1${PLACEHOLDER}` },
  { re: /([?&]X-Amz-Credential=)[^&\s'"]+/gi, replace: `$1${PLACEHOLDER}` },
  { re: /([?&]X-Amz-Security-Token=)[^&\s'"]+/gi, replace: `$1${PLACEHOLDER}` },
];

/**
 * Strip credentials from build-log text.
 *
 * Returns the cleaned text and whether anything matched, so a caller can tell
 * the reader something was removed rather than silently altering output.
 */
export function redactBuildLog(input: string): {
  text: string;
  redacted: boolean;
} {
  let text = input;

  for (const { re, replace } of PATTERNS) {
    // Fresh lastIndex each pass; these are /g and reused across calls.
    re.lastIndex = 0;
    text = text.replace(re, replace);
  }

  // Compare the result rather than trusting that a match implies a change.
  // A pattern can match text a previous pattern already replaced and produce
  // an identical string — flagging that would tell the reader something was
  // removed when nothing was. app-deploy-3 hit the same class in their
  // sanitiser: a stage marked dropped that had no body still set the flag. A
  // sanitiser that cries wolf gets ignored, and then it is not a defence.
  return { text, redacted: text !== input };
}
