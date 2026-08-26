/**
 * GitHub webhook verification and push-event parsing.
 *
 * Deliberately pure: no network, no database, no environment reads beyond the
 * secret handed in. Everything that decides whether a request is genuine, and
 * everything that decides what it asks for, is testable without a cluster.
 *
 * THE THREAT THIS GUARDS
 *
 * The webhook endpoint is public and unauthenticated by definition — GitHub
 * cannot present a session. So the signature IS the authentication. Anyone who
 * can POST to it and be believed can cause arbitrary repositories to be built
 * and deployed on our infrastructure, which is both a spend attack and, if the
 * repo is attacker-controlled, arbitrary code running in our build VMs.
 *
 * That makes three rules non-negotiable:
 *
 *   1. Verify over the RAW BODY BYTES, never a re-serialised object. JSON
 *      round-tripping changes key order and whitespace, so a re-serialised body
 *      computes a different digest — a verifier that re-serialises either
 *      rejects everything or, worse, is "fixed" later by skipping the check.
 *   2. Compare in CONSTANT TIME. A byte-by-byte early return leaks the expected
 *      digest to anyone willing to time a few thousand requests.
 *   3. A MISSING secret is a hard failure, never a skipped check. The most
 *      common way this endpoint gets left open is an unset env var in one
 *      environment turning verification into a no-op.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { paasConfig } from "../config.ts";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no-secret" | "no-signature" | "bad-format" | "mismatch" };

/**
 * Verify GitHub's X-Hub-Signature-256 over the raw request body.
 *
 * `body` must be the exact bytes received. Pass a Buffer or the raw text — not
 * a parsed and re-stringified object.
 */
export function verifySignature(body: Buffer | string, signature: string | null, secret: string | undefined): VerifyResult {
  if (!secret || !secret.trim()) return { ok: false, reason: "no-secret" };
  if (!signature) return { ok: false, reason: "no-signature" };
  if (!signature.startsWith("sha256=")) return { ok: false, reason: "bad-format" };

  const provided = signature.slice("sha256=".length);
  // A hex digest is fixed-length; anything else cannot match and would make
  // timingSafeEqual throw on a length mismatch rather than return false.
  if (!/^[0-9a-f]{64}$/i.test(provided)) return { ok: false, reason: "bad-format" };

  const expected = createHmac("sha256", secret)
    .update(typeof body === "string" ? Buffer.from(body, "utf8") : body)
    .digest("hex");

  const a = Buffer.from(provided.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}

export interface PushEvent {
  repoFullName: string;
  /** Branch name with refs/heads/ stripped. Null for tags and other refs. */
  branch: string | null;
  sha: string;
  message: string | null;
  author: string | null;
  /** True when the push deleted the branch — nothing to build. */
  deleted: boolean;
  installationId: number | null;
}

/**
 * Parse a push payload into the few facts a deploy needs.
 *
 * Returns null when the payload is not a usable push. Being strict here is
 * deliberate: an unparseable payload that silently becomes a deploy with
 * guessed values is worse than one that is refused and logged.
 */
export function parsePushEvent(payload: unknown): PushEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, any>;

  const repoFullName = p.repository?.full_name;
  const ref = p.ref;
  const sha = p.after ?? p.head_commit?.id;
  if (typeof repoFullName !== "string" || typeof ref !== "string" || typeof sha !== "string") return null;
  if (!/^[0-9a-f]{40}$/i.test(sha)) return null;

  // An all-zero `after` is GitHub's way of saying the ref was deleted. It also
  // passes the sha shape test, so it has to be recognised explicitly rather
  // than deployed as if it were a commit.
  const deleted = p.deleted === true || /^0{40}$/.test(sha);

  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null;

  return {
    repoFullName,
    branch,
    sha: sha.toLowerCase(),
    message: typeof p.head_commit?.message === "string" ? p.head_commit.message.slice(0, 500) : null,
    author:
      typeof p.head_commit?.author?.username === "string"
        ? p.head_commit.author.username
        : typeof p.head_commit?.author?.name === "string"
          ? p.head_commit.author.name
          : null,
    deleted,
    installationId: typeof p.installation?.id === "number" ? p.installation.id : null,
  };
}

export type PushDecision =
  /**
   * `kind` decides everything downstream that differs between the two: which
   * hostname is minted, which tier's resources the pod gets, and whether the
   * result is ever reaped. Carrying it here rather than re-deriving it later
   * means one comparison against the production branch, in one place — the
   * alternative is three places that can disagree about what a push was.
   */
  | { deploy: true; kind: "production" | "preview"; branch: string }
  | { deploy: false; reason: string };

/**
 * Decide whether a push should produce a deployment, and of what kind.
 *
 * Separated from parsing so the policy is inspectable on its own, and so
 * "we received it but chose not to build" is a distinct, loggable outcome from
 * "we could not understand it".
 *
 * A branch DELETION is still not a deploy, and deliberately does not reap the
 * preview either. Reaping is time-based — 48 hours from the last push — because
 * a deletion webhook is a message that can be missed, and a preview whose only
 * cleanup path is an event nobody received runs free forever. The sweep does not
 * need to have seen anything to do its job.
 */
export function shouldDeploy(event: PushEvent, productionBranch: string): PushDecision {
  if (event.deleted) return { deploy: false, reason: "branch deleted" };
  if (event.branch === null) return { deploy: false, reason: `ref is not a branch` };
  return {
    deploy: true,
    kind: event.branch === productionBranch ? "production" : "preview",
    branch: event.branch,
  };
}

/**
 * Convenience wrapper reading the secret from configuration.
 *
 * The explicit-secret form above is the testable one and should be preferred in
 * new code. This exists because a route has no reason to know where the secret
 * comes from, and because dropping it when this module was rewritten would have
 * been a silent removal of a working API.
 *
 * Note it returns the structured result rather than a bare boolean: "no secret
 * configured" and "signature did not match" need different handling — the first
 * is our misconfiguration and should page someone, the second is someone
 * probing the endpoint.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string | null): VerifyResult {
  return verifySignature(rawBody, signatureHeader, paasConfig.github.webhookSecret());
}

/** Extract the branch name from a push ref (`refs/heads/main` -> `main`). */
export function branchFromRef(ref: string): string | null {
  const m = ref.match(/^refs\/heads\/(.+)$/);
  return m ? m[1] : null;
}
