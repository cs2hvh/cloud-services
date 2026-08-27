/**
 * Bitbucket webhook verification and push-event parsing.
 *
 * Pure: no network, no database, no environment reads beyond the secret handed
 * in.
 *
 * BITBUCKET SIGNS, LIKE GITHUB — but only when a secret is configured on the
 * webhook, and that is the trap. With no secret set, Bitbucket sends no
 * signature header at all and the request looks exactly like one from an
 * attacker who omitted it. There is no way to tell "this hook has no secret"
 * from "someone stripped the header" at the endpoint, so BOTH are refused:
 * `no-secret` when we hold none, `no-signature` when the request carries none.
 *
 * The header is `X-Hub-Signature` — note NO `-256` suffix, unlike GitHub's
 * `X-Hub-Signature-256`, even though the algorithm inside is also SHA-256. A
 * verifier copied from the GitHub module and left reading the GitHub header
 * name finds nothing, returns `no-signature`, and refuses every legitimate
 * push — which fails loudly and is the safe direction. The dangerous direction
 * is the reverse: pointing GitHub's route at this header name would make every
 * GitHub push unverifiable, and "just skip the check" is the tempting fix.
 *
 * The three rules hold as they do for GitHub:
 *
 *   1. Verify over the RAW BODY BYTES, never a re-serialised object.
 *   2. Compare in CONSTANT TIME.
 *   3. A MISSING secret is a hard failure, never a skipped check.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { GitProvider, ProviderPushEvent, VerifyResult } from "../providers/types.ts";

const PROVIDER: GitProvider = "bitbucket";

/** Bitbucket's header, deliberately named so nobody has to remember the difference. */
export const BITBUCKET_SIGNATURE_HEADER = "x-hub-signature";

/**
 * Verify Bitbucket's `X-Hub-Signature` (HMAC-SHA256) over the raw body.
 *
 * `body` must be the exact bytes received. A parsed-and-re-stringified object
 * computes a different digest, because JSON round-tripping changes key order
 * and whitespace.
 */
export function verifySignature(
  body: Buffer | string,
  signature: string | null,
  secret: string | undefined,
): VerifyResult {
  if (!secret || !secret.trim()) return { ok: false, reason: "no-secret" };
  if (!signature) return { ok: false, reason: "no-signature" };
  if (!signature.startsWith("sha256=")) return { ok: false, reason: "bad-format" };

  const provided = signature.slice("sha256=".length);
  // Fixed-length hex. Anything else cannot match, and would make timingSafeEqual
  // throw on a length mismatch rather than return false.
  if (!/^[0-9a-f]{64}$/i.test(provided)) return { ok: false, reason: "bad-format" };

  const expected = createHmac("sha256", secret)
    .update(typeof body === "string" ? Buffer.from(body, "utf8") : body)
    .digest("hex");

  const a = Buffer.from(provided.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * Parse a Bitbucket `repo:push` payload into the normalised event.
 *
 * BITBUCKET'S SHAPE IS THE ODD ONE and the difference is load-bearing: a push
 * carries `push.changes[]`, an ARRAY, because one push can move several
 * branches at once. GitHub and GitLab send one ref per delivery.
 *
 * This parses the FIRST change and says so, rather than silently dropping the
 * rest. Taking only the first is right for the common case — one branch, one
 * push — and `additionalChanges` exists so a caller can see when it was not,
 * instead of a multi-branch push looking identical to a single-branch one.
 */
export function parsePushEvent(payload: unknown): (ProviderPushEvent & { additionalChanges: number }) | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  const repository = p.repository as
    | { full_name?: unknown; uuid?: unknown; workspace?: { uuid?: unknown; slug?: unknown } }
    | undefined;
  const repoFullName = repository?.full_name;
  if (typeof repoFullName !== "string") return null;

  const push = p.push as { changes?: unknown } | undefined;
  const changes = Array.isArray(push?.changes) ? (push!.changes as Array<Record<string, unknown>>) : [];
  if (changes.length === 0) return null;

  const change = changes[0];
  const newRef = change.new as { name?: unknown; type?: unknown; target?: Record<string, unknown> } | undefined;
  const oldRef = change.old as { name?: unknown; type?: unknown } | undefined;

  // `new: null` with an `old` present is Bitbucket's branch deletion — there is
  // no all-zero sha to recognise, so the absence itself is the signal. `closed`
  // is set on the same event and is checked too rather than relied on alone.
  const deleted = newRef == null || change.closed === true;

  if (deleted) {
    const name = typeof oldRef?.name === "string" ? oldRef.name : null;
    return {
      provider: PROVIDER,
      repoFullName,
      branch: oldRef?.type === "branch" ? name : null,
      // A deletion carries no commit to build. Zeroes rather than a made-up
      // hash, matching what GitHub sends for the same event.
      sha: "0".repeat(40),
      message: null,
      author: authorFrom(p),
      deleted: true,
      connectionId: workspaceIdFrom(repository),
      additionalChanges: changes.length - 1,
    };
  }

  // Tags and bookmarks arrive here too. Only `branch` is deployable, and a tag
  // whose `type` is unread would deploy as though its name were a branch.
  const branch = newRef?.type === "branch" && typeof newRef.name === "string" ? newRef.name : null;

  const target = newRef?.target as { hash?: unknown; message?: unknown; author?: unknown } | undefined;
  const sha = target?.hash;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) return null;

  return {
    provider: PROVIDER,
    repoFullName,
    branch,
    sha: sha.toLowerCase(),
    message: typeof target?.message === "string" ? target.message.slice(0, 500) : null,
    author: authorFrom(p) ?? commitAuthorFrom(target),
    deleted: false,
    connectionId: workspaceIdFrom(repository),
    additionalChanges: changes.length - 1,
  };
}

/** The account that pushed, which is not necessarily the commit's author. */
function authorFrom(p: Record<string, unknown>): string | null {
  const actor = p.actor as { nickname?: unknown; display_name?: unknown } | undefined;
  if (typeof actor?.nickname === "string") return actor.nickname;
  if (typeof actor?.display_name === "string") return actor.display_name;
  return null;
}

/**
 * The commit author, as a fallback.
 *
 * Bitbucket sends `author.raw` as a git identity line — `Name <email>` — so the
 * email is stripped rather than stored. A commit author's address is personal
 * data that nothing downstream needs, and the display name answers the only
 * question anyone asks of this field.
 */
function commitAuthorFrom(target: { author?: unknown } | undefined): string | null {
  const author = target?.author as { user?: { nickname?: unknown }; raw?: unknown } | undefined;
  if (typeof author?.user?.nickname === "string") return author.user.nickname;
  if (typeof author?.raw === "string") {
    const name = author.raw.replace(/\s*<[^>]*>\s*$/, "").trim();
    return name || null;
  }
  return null;
}

/**
 * The workspace UUID this push belongs to.
 *
 * A UUID, not a number — which is why `connectionId` is text across every
 * provider. Falls back to the repository's own uuid, and to null rather than to
 * the slug: a slug is renameable and a connection keyed on one would silently
 * detach the day someone renames their workspace.
 */
function workspaceIdFrom(
  repository: { uuid?: unknown; workspace?: { uuid?: unknown; slug?: unknown } } | undefined,
): string | null {
  if (typeof repository?.workspace?.uuid === "string") return repository.workspace.uuid;
  if (typeof repository?.uuid === "string") return repository.uuid;
  return null;
}
