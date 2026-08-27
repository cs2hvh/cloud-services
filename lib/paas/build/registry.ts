/**
 * Is a published image durably in the registry?
 *
 * WHY THIS EXISTS. Every build writes `builds/<ref>/image.tar` to R2 as the
 * transfer artifact — the build VM holds no registry credentials by design, so
 * it cannot push, and a trusted in-cluster publisher pulls the tar and runs
 * skopeo instead. That is the right shape and the tar has to be written.
 *
 * What was missing is the other end. Nothing deleted the tar afterwards, so
 * every deployment ever made left a full OCI archive behind: 592 MB across 8
 * deployments, 65% of the bucket, growing with deploy frequency rather than
 * settling.
 *
 * app-deploy-3 argued against automating the REAPER for this — the reaper is
 * report-only by design, its licence to delete comes from a human reading the
 * plan, and turning it into an hourly unattended deleter means the first time
 * its classification is wrong it is wrong 24 times a day with nobody watching.
 * They were right, and they named the better fix: do not schedule the
 * collection of garbage, stop producing it. The moment skopeo finishes, the tar
 * is a second copy of something already stored durably.
 *
 * SAFE BY OBSERVATION, NOT BY CLASSIFICATION. This never infers durability from
 * "the publisher job succeeded". It reads the registry's own storage and
 * requires BOTH:
 *
 *   1. the manifest blob         .../blobs/sha256/<aa>/<digest>/data
 *   2. the repository link       .../repositories/<repo>/_manifests/revisions/sha256/<digest>/link
 *
 * The blob alone is not enough. Blobs are content-addressed and shared across
 * repositories, and an unreferenced one is exactly what registry garbage
 * collection deletes. The link is what makes it reachable for this repository,
 * so requiring both is the difference between "these bytes exist somewhere" and
 * "this image can be pulled".
 */

import { getObject } from "./r2.ts";

/**
 * Docker Distribution's layout under its configured rootdirectory. The registry
 * writes these paths; this module only reads them.
 */
export const registryKeys = {
  manifestBlob: (digest: string) => {
    const hex = digest.replace(/^sha256:/, "");
    return `registry/docker/registry/v2/blobs/sha256/${hex.slice(0, 2)}/${hex}/data`;
  },
  revisionLink: (repo: string, digest: string) => {
    const hex = digest.replace(/^sha256:/, "");
    return `registry/docker/registry/v2/repositories/${repo}/_manifests/revisions/sha256/${hex}/link`;
  },
};

export interface DurabilityVerdict {
  durable: boolean;
  /**
   * Every key consulted and what was found. A verdict that cannot say what it
   * looked at is indistinguishable from one that looked at nothing — the
   * failure this codebase has produced eight times in a day.
   */
  checked: Array<{ key: string; present: boolean }>;
  reason: string;
}

/**
 * Prove an image is pullable from the registry's own storage.
 *
 * Returns rather than throws: the caller is deciding whether to delete a
 * transfer artifact, and "could not verify" must lead to KEEPING the tar, not
 * to an exception that aborts a deploy which has otherwise succeeded.
 *
 * A read error is therefore reported as not-durable. That is the correct bias:
 * the cost of a false negative is a tarball nobody deleted; the cost of a false
 * positive is deleting the only copy of an image the registry does not have.
 */
export async function imageIsDurable(repo: string, digest: string): Promise<DurabilityVerdict> {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    return {
      durable: false,
      checked: [],
      reason: `digest ${JSON.stringify(digest)} is not a sha256 reference — refusing to check, and therefore refusing to delete`,
    };
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(repo)) {
    return { durable: false, checked: [], reason: `repository ${JSON.stringify(repo)} is not a legal name` };
  }

  const keys = [registryKeys.manifestBlob(digest), registryKeys.revisionLink(repo, digest)];
  const checked: DurabilityVerdict["checked"] = [];

  for (const key of keys) {
    let present = false;
    try {
      present = (await getObject(key)) !== null;
    } catch {
      // Distinguished from "absent" only in the reason string, because the
      // ACTION is the same either way: do not delete. Saying which it was
      // matters when someone reads the log wondering why nothing was reclaimed.
      return {
        durable: false,
        checked,
        reason: `could not read ${key} — treating as not durable`,
      };
    }
    checked.push({ key, present });
  }

  const missing = checked.filter((c) => !c.present).map((c) => c.key);
  if (missing.length) {
    return { durable: false, checked, reason: `missing from registry storage: ${missing.join(", ")}` };
  }

  return {
    durable: true,
    checked,
    reason: `manifest blob and repository link both present for ${repo}@${digest.slice(0, 19)}…`,
  };
}
