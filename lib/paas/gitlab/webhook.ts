/**
 * GitLab webhook verification and push-event parsing.
 *
 * Pure: no network, no database, no environment reads beyond the secret handed
 * in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * GITLAB'S CHECK IS WEAKER THAN GITHUB'S AND THIS FILE SAYS SO RATHER THAN
 * PRETENDING THEY ARE THE SAME.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * GitHub sends `X-Hub-Signature-256`: an HMAC-SHA256 over the raw body. That
 * proves two things at once — the sender knows the secret, AND the body has not
 * been altered in transit, because any change to the bytes changes the digest.
 *
 * GitLab sends `X-Gitlab-Token`: the secret itself, in a header. That proves
 * exactly one thing — the sender knows the secret. It is **not computed over
 * the body**, so it says nothing whatever about whether the payload was
 * modified between GitLab and us, and an identical token authenticates any body
 * at all.
 *
 * What follows from that, concretely:
 *
 *   - Anything that can see the header can replay it verbatim against any
 *     payload it likes. With an HMAC, a replayed signature only authenticates
 *     the body it was computed for.
 *   - The secret travels on every request rather than a derivative of it, so
 *     one logged request header is the secret itself. Do not log headers here.
 *   - TLS is doing the integrity work that the HMAC does for GitHub. That is
 *     not nothing, but it is a different guarantee with a different trust base.
 *
 * This is GitLab's design, not a mistake in ours, and there is no HMAC option
 * to switch on. The mitigation is to treat the token as the high-value secret
 * it is — rotate it independently per project, never log it — and to keep the
 * comparison constant-time so the endpoint does not leak it a byte at a time.
 *
 * The three rules from the GitHub module still hold, and the third is the one
 * that most often goes wrong: A MISSING SECRET IS A HARD FAILURE, NEVER A
 * SKIPPED CHECK. An unset env var in one environment turning verification into
 * a no-op is how this endpoint gets left open.
 */

import { timingSafeEqual } from "node:crypto";
import type { GitProvider, ProviderPushEvent, VerifyResult } from "../providers/types.ts";

const PROVIDER: GitProvider = "gitlab";

/**
 * Verify GitLab's `X-Gitlab-Token` against the configured secret.
 *
 * Takes the body it does not use, deliberately. Every other provider's verifier
 * needs it, and a signature that differs in arity across providers invites a
 * caller to wire them up differently — which is how one of them ends up called
 * without the body it actually needed. The unused parameter is the cheapest
 * available reminder that this check does NOT cover the payload.
 */
export function verifyToken(
  _body: Buffer | string,
  token: string | null,
  secret: string | undefined,
): VerifyResult {
  if (!secret || !secret.trim()) return { ok: false, reason: "no-secret" };
  if (!token) return { ok: false, reason: "no-signature" };

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");

  // Length is public — it leaks from the comparison no matter what, and
  // timingSafeEqual throws rather than returning false on a length mismatch.
  // Reporting `mismatch` rather than `bad-format` keeps a wrong-length token
  // indistinguishable from a wrong-value one in the response.
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * Parse a GitLab push payload into the normalised event.
 *
 * Returns null when the payload is not a usable push. Strict on purpose: an
 * unparseable payload that becomes a deploy with guessed values is worse than
 * one that is refused and logged.
 */
export function parsePushEvent(payload: unknown): ProviderPushEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // GitLab sends tag pushes, merge requests, issues and more to the same URL.
  // `object_kind` is the only reliable discriminator; the header can be spoofed
  // and is not part of the authenticated material either way.
  if (p.object_kind !== "push") return null;

  const project = p.project as
    | { path_with_namespace?: unknown; id?: unknown; default_branch?: unknown }
    | undefined;
  const repoFullName = project?.path_with_namespace;
  const ref = p.ref;
  const sha = p.after;

  if (typeof repoFullName !== "string" || typeof ref !== "string" || typeof sha !== "string") return null;
  if (!/^[0-9a-f]{40}$/i.test(sha)) return null;

  // An all-zero `after` means the branch was deleted. It passes the sha shape
  // test, so it has to be recognised explicitly rather than deployed as if it
  // were a commit.
  const deleted = /^0{40}$/.test(sha);

  // GitLab's `commits` array is ordered oldest-first, so the commit `after`
  // points at is the LAST one — not commits[0], which is what a reader used to
  // GitHub's head_commit would reach for and would attribute the wrong author.
  const commits = Array.isArray(p.commits) ? (p.commits as Array<Record<string, unknown>>) : [];
  const head = commits.length > 0 ? commits[commits.length - 1] : undefined;
  const headAuthor = head?.author as { name?: unknown; email?: unknown } | undefined;

  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;

  return {
    provider: PROVIDER,
    repoFullName,
    branch,
    sha: sha.toLowerCase(),
    message: typeof head?.message === "string" ? head.message.slice(0, 500) : null,
    // `user_username` is the pusher; the commit author may be someone else.
    // Preferring the pusher matches GitHub's head_commit.author.username, which
    // is also the account that triggered the event rather than the patch author.
    author:
      typeof p.user_username === "string"
        ? p.user_username
        : typeof headAuthor?.name === "string"
          ? headAuthor.name
          : null,
    deleted,
    // Numeric on GitLab; carried as text so one column holds every provider's
    // identifier, including Bitbucket's UUID.
    connectionId: typeof project?.id === "number" ? String(project.id) : null,
  };
}

/**
 * The project's default branch, when the payload states it.
 *
 * Null rather than `"main"` when absent. A guessed production branch decides
 * whether a push is a production deploy or a preview, and guessing it wrong
 * puts a feature branch on the customer's live hostname — the same class of
 * outage the alias-scoping fix closed.
 */
export function defaultBranchFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const project = (payload as Record<string, unknown>).project as { default_branch?: unknown } | undefined;
  return typeof project?.default_branch === "string" && project.default_branch ? project.default_branch : null;
}
