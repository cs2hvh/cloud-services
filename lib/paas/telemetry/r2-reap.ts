/**
 * Deciding which R2 objects are provably safe to delete.
 *
 * I ARGUED AGAINST BUILDING THIS, AND THE ARGUMENT WAS RIGHT FOR THE REAPER I
 * WAS ARGUING ABOUT.
 *
 * A reaper that deletes on the strength of a classification is one mapping bug
 * away from destroying every app's build logs, and object deletion has no
 * undo. `r2-drift.ts` therefore reports and stops.
 *
 * What changed is not the appetite for risk — it is that ONE case can be
 * verified rather than inferred.
 *
 * An `image.tar` is reclaimable because the image is durably stored in the
 * registry. The registry is backed by the SAME BUCKET, at
 * `registry/docker/registry/v2/blobs/sha256/<xx>/<digest>/data`. So the claim
 * "a durable copy exists" is not a deduction from `state = 'ready'`, or from
 * the schema requiring a digest on ready rows — it is a key that is either
 * present in the listing or is not.
 *
 * That is the difference between safe by classification and safe by
 * observation, and it is the only reason this file exists. Everything it
 * cannot observe, it refuses to touch: logs, meta.json, caches, registry
 * blobs, and anything whose key shape it does not recognise. No flag reaches
 * them.
 *
 * A MISSING BLOB IS A FINDING, NOT A SKIP. If a deployment is marked ready and
 * its manifest is absent from the bucket, that is a far worse problem than a
 * wasted tarball — it means the control plane believes an image is published
 * that is not there, and a rollback to it would fail. The tar is kept and the
 * discrepancy is raised.
 *
 * Pure. No network, no deletion. The caller does both.
 */

import type { R2Finding } from "./r2-drift.ts";

/**
 * Where Docker Distribution stores a blob, given the registry's configured
 * root directory.
 *
 * Layout is `<root>/docker/registry/v2/blobs/sha256/<first two hex>/<full
 * hex>/data`. Confirmed against the live bucket rather than the docs — the
 * two-character shard directory is easy to get wrong and produces a key that
 * simply never matches, which would make every tar look unverifiable and this
 * tool refuse to do anything. Failing that way is safe, but silently.
 */
export function registryBlobKey(digest: string, root = "registry"): string | null {
  const m = /^sha256:([0-9a-f]{64})$/.exec(digest.trim());
  if (!m) return null;
  const hex = m[1];
  return `${root}/docker/registry/v2/blobs/sha256/${hex.slice(0, 2)}/${hex}/data`;
}

export interface ReapCandidate {
  /** The object to delete. */
  key: string;
  bytes: number;
  deploymentRef: string;
  /** The blob whose presence makes deleting `key` safe. */
  provenBy: string;
}

export interface ReapBlocked {
  key: string;
  bytes: number;
  deploymentRef: string;
  reason: string;
  /** True when this indicates a problem worse than the wasted object. */
  alarming: boolean;
}

export interface ReapPlan {
  /** Provably safe: a durable copy was observed in the bucket. */
  candidates: ReapCandidate[];
  /** Reclaimable by classification but NOT provable. Kept. */
  blocked: ReapBlocked[];
  reclaimableBytes: number;
  /** Bytes left on the table because proof was unavailable. */
  blockedBytes: number;
}

export interface ReapInput {
  findings: R2Finding[];
  /** `image_digest` for a deployment ref, when the control plane has one. */
  digestOf: (deploymentRef: string) => string | null;
  /** Every key present in the bucket, for observing the blob. */
  presentKeys: Set<string>;
  /**
   * Deployment refs that some alias currently points at.
   *
   * Belt and braces over the blob check, at the infrastructure lane's
   * request. These are the deployments whose loss would be customer-visible,
   * and the marginal value of reclaiming their tar is a rounding error
   * against the cost of being wrong about one. The blob check should make
   * this unnecessary; that is not a reason to skip it.
   */
  aliasedDeployments: Set<string>;
  registryRoot?: string;
}

/**
 * Which objects may be deleted, and why each of the others may not.
 *
 * Deliberately narrow: only `image.tar`, only where `r2-drift` already
 * classified the object `redundant`, and only where the manifest blob is
 * observed. Orphaned tars from failed builds are reclaimable by
 * classification but have NO durable copy to point at — nothing was ever
 * published — so they are reported as blocked rather than deleted. They are
 * genuinely waste; they are just not waste this file can prove.
 */
export function planReap(input: ReapInput): ReapPlan {
  const candidates: ReapCandidate[] = [];
  const blocked: ReapBlocked[] = [];
  const root = input.registryRoot ?? "registry";

  for (const f of input.findings) {
    if (!f.key.endsWith("/image.tar")) continue;
    if (!f.reclaimable) continue;

    const ref = f.deploymentRef;
    if (!ref) {
      blocked.push({
        key: f.key,
        bytes: f.bytes,
        deploymentRef: "—",
        reason: "no deployment ref parsed from the key",
        alarming: false,
      });
      continue;
    }

    if (f.disposition !== "redundant") {
      blocked.push({
        key: f.key,
        bytes: f.bytes,
        deploymentRef: ref,
        reason:
          `${f.disposition}: nothing was ever published for this deployment, so there ` +
          `is no durable copy to point at. Waste, but not provable waste.`,
        alarming: false,
      });
      continue;
    }

    if (input.aliasedDeployments.has(ref)) {
      blocked.push({
        key: f.key,
        bytes: f.bytes,
        deploymentRef: ref,
        reason:
          `an alias currently points at this deployment. Its loss is the only kind here ` +
          `that a customer would see, and reclaiming one tar is not worth being wrong once.`,
        alarming: false,
      });
      continue;
    }

    const digest = input.digestOf(ref);
    const blobKey = digest ? registryBlobKey(digest, root) : null;

    if (!blobKey) {
      blocked.push({
        key: f.key,
        bytes: f.bytes,
        deploymentRef: ref,
        reason: digest
          ? `image_digest ${digest.slice(0, 24)}… is not a well-formed sha256 reference`
          : "the deployment row carries no image_digest",
        // A `ready` row is required by the schema to have one. Missing means
        // something is wrong with the row, not with this tool.
        alarming: true,
      });
      continue;
    }

    if (!input.presentKeys.has(blobKey)) {
      blocked.push({
        key: f.key,
        bytes: f.bytes,
        deploymentRef: ref,
        reason:
          `the registry blob for this image is NOT in the bucket (${blobKey}). The ` +
          `control plane believes this deployment is published and its image is not ` +
          `there — a rollback to it would fail. Keeping the tar; it may be the only copy.`,
        alarming: true,
      });
      continue;
    }

    candidates.push({ key: f.key, bytes: f.bytes, deploymentRef: ref, provenBy: blobKey });
  }

  return {
    candidates,
    blocked,
    reclaimableBytes: candidates.reduce((n, c) => n + c.bytes, 0),
    blockedBytes: blocked.reduce((n, b) => n + b.bytes, 0),
  };
}
