/**
 * R2 object reconciliation: what the bucket holds against what the control
 * plane still needs.
 *
 * NOTHING PRUNES THIS BUCKET. Every deployment ever made writes
 * `builds/<ref>/image.tar`, `builds/<ref>/build.log` and
 * `builds/<ref>/meta.json`, and no code path deletes any of them. One day of
 * testing left 486 MB across 7 deployments. At the plan's 10,000-app target
 * with a handful of deployments each, that is a storage bill nobody decided to
 * incur, growing monotonically, invisible in every other report.
 *
 * THE BIGGEST SINGLE WIN IS `image.tar` FOR A READY DEPLOYMENT, and it is
 * worth stating why it is safe rather than just marking it.
 *
 * The tarball is a TRANSFER artifact, not storage. The build VM writes an
 * OCI archive, skopeo copies it into the in-cluster registry, and from that
 * moment the deployable image is the registry's digest-pinned copy — the
 * schema enforces this: `deployments_ready_has_image` requires image_repo and
 * image_digest on any row in state `ready`. Rollback repoints a Service
 * selector at a digest; it never re-reads the tarball. So once a deployment is
 * ready, its tar is a second copy of something already stored durably
 * elsewhere, and it is by far the largest object of the three.
 *
 * Logs are treated differently. A customer opening a six-month-old build log
 * is a reasonable thing to do, and the object is small. Retention for logs is
 * a policy question, not a wasted-bytes question, so this reports their size
 * and does not call them reclaimable.
 *
 * Pure. No network. REPORT-ONLY, and deliberately so — this classifies what
 * could be deleted and deletes nothing. An object storage reaper that acts on
 * a classification is one mapping bug away from destroying the build logs of
 * every app on the platform.
 */

/** Cloudflare R2 standard storage, USD per GB-month. */
export const R2_GB_MONTH_USD = 0.015;

export type R2Disposition =
  | "in-flight" // a build is using it right now
  | "redundant" // safely reclaimable: a durable copy exists elsewhere
  | "orphan" // nothing in the control plane refers to it at all
  | "retain" // still serves a purpose
  | "unknown"; // key shape this module does not recognise

export interface R2ObjectLike {
  key: string;
  size: number;
  lastModified: string;
}

export interface DeploymentLike {
  ref: string;
  state: string;
  image_digest: string | null;
}

export interface R2Finding {
  key: string;
  disposition: R2Disposition;
  bytes: number;
  /** Deployment ref parsed from the key, when the shape is recognised. */
  deploymentRef: string | null;
  /**
   * Safe to delete today. Deliberately NOT the same as `disposition !==
   * "retain"`: an orphaned build LOG is a finding — the control plane has lost
   * track of a deployment — but it is still the only record of why that build
   * behaved as it did, and one of those "orphans" turned out to belong to an
   * app that is running right now. Only artifacts with a durable copy
   * elsewhere, or that were never usable, are reclaimable.
   */
  reclaimable: boolean;
  detail: string;
  lastModified: string;
}

export interface R2DriftReport {
  findings: R2Finding[];
  totalBytes: number;
  /** Bytes safely reclaimable today: redundant plus orphaned. */
  reclaimableBytes: number;
  byDisposition: Record<R2Disposition, { objects: number; bytes: number }>;
  /** Monthly storage cost of the reclaimable portion. */
  reclaimableMonthlyUsd: number;
  totalMonthlyUsd: number;
  clean: boolean;
}

/** States in which a build is still running and its artifacts are live. */
const IN_FLIGHT = new Set(["queued", "building", "publishing"]);

/** States meaning the build finished and produced nothing deployable. */
const FAILED = new Set(["error", "canceled"]);

export interface ParsedKey {
  kind: "build-artifact" | "cache" | "registry" | "unknown";
  deploymentRef: string | null;
  filename: string | null;
  /** For cache keys. */
  teamRef?: string;
  projectRef?: string;
}

/**
 * Parse an object key into what it refers to.
 *
 * Mirrors `r2Keys` in lib/paas/build/r2.ts. A key that does not match a known
 * shape is `unknown` and is never called reclaimable — the whole point of a
 * cleanup report is that it must not propose deleting something it does not
 * understand.
 */
export function parseKey(key: string): ParsedKey {
  // The in-cluster registry is backed by this same bucket. These blobs ARE the
  // deployed images — they are what makes an `image.tar` redundant in the first
  // place. Recognising them explicitly, rather than leaving them unclassified,
  // matters twice over: a cleanup report permanently full of unknowns is one
  // nobody reads, and the one thing worse than not reclaiming 210 MB is
  // proposing to delete every running app's image.
  if (/^registry\//.test(key)) {
    return { kind: "registry", deploymentRef: null, filename: null };
  }

  const build = /^builds\/([^/]+)\/([^/]+)$/.exec(key);
  if (build) {
    return { kind: "build-artifact", deploymentRef: build[1], filename: build[2] };
  }

  const cache = /^cache\/([^/]+)\/([^/]+)\//.exec(key);
  if (cache) {
    return {
      kind: "cache",
      deploymentRef: null,
      filename: null,
      teamRef: cache[1],
      projectRef: cache[2],
    };
  }

  return { kind: "unknown", deploymentRef: null, filename: null };
}

export interface R2ReconcileInput {
  objects: R2ObjectLike[];
  deployments: DeploymentLike[];
  /** Project refs that still exist, for classifying cache keys. */
  liveProjectRefs?: string[];
}

export function reconcileR2(input: R2ReconcileInput): R2DriftReport {
  const byRef = new Map(input.deployments.map((d) => [d.ref, d]));
  const liveProjects = new Set(input.liveProjectRefs ?? []);
  const findings: R2Finding[] = [];

  for (const o of input.objects) {
    const parsed = parseKey(o.key);
    const base = { key: o.key, bytes: o.size, lastModified: o.lastModified };

    if (parsed.kind === "registry") {
      findings.push({
        ...base,
        disposition: "retain",
        deploymentRef: null,
        reclaimable: false,
        detail: "in-cluster registry blob — this IS a deployed image, and never reclaimable here",
      });
      continue;
    }

    if (parsed.kind === "unknown") {
      findings.push({
        ...base,
        disposition: "unknown",
        deploymentRef: null,
        reclaimable: false,
        detail: "key shape not recognised — not classified, and never proposed for deletion",
      });
      continue;
    }

    if (parsed.kind === "cache") {
      const known = liveProjects.size === 0 || liveProjects.has(parsed.projectRef ?? "");
      findings.push({
        ...base,
        disposition: known ? "retain" : "orphan",
        deploymentRef: null,
        // A build cache is regenerable by definition; that is what makes it a
        // cache rather than an artifact.
        reclaimable: !known,
        detail: known
          ? `build cache for ${parsed.teamRef}/${parsed.projectRef}`
          : `build cache for ${parsed.projectRef}, which no longer exists`,
      });
      continue;
    }

    const ref = parsed.deploymentRef as string;
    const deployment = byRef.get(ref);
    const isTar = parsed.filename === "image.tar";

    if (!deployment) {
      findings.push({
        ...base,
        disposition: "orphan",
        deploymentRef: ref,
        // The tar is reclaimable; the log is not. A missing row does not mean
        // the app is gone — on the live cluster, several of these belong to
        // deployments that are running right now and simply predate the
        // recording work. Deleting their logs would destroy the only account
        // of how they were built.
        reclaimable: isTar,
        detail:
          `no paas.deployments row for ${ref}` +
          (isTar ? "" : " — kept anyway; a missing row is not proof the app is gone"),
      });
      continue;
    }

    if (IN_FLIGHT.has(deployment.state)) {
      findings.push({
        ...base,
        disposition: "in-flight",
        deploymentRef: ref,
        reclaimable: false,
        detail: `deployment is ${deployment.state}`,
      });
      continue;
    }

    if (isTar && deployment.state === "ready" && deployment.image_digest) {
      findings.push({
        ...base,
        disposition: "redundant",
        deploymentRef: ref,
        reclaimable: true,
        detail:
          `transfer artifact; the image is in the registry at ` +
          `${deployment.image_digest.slice(0, 19)}… and rollback repoints a selector at ` +
          `that digest rather than re-reading this tar`,
      });
      continue;
    }

    if (isTar && FAILED.has(deployment.state)) {
      findings.push({
        ...base,
        disposition: "orphan",
        deploymentRef: ref,
        reclaimable: true,
        detail: `deployment ${deployment.state}; this tar was never published and never will be`,
      });
      continue;
    }

    if (isTar) {
      // `ready` with no digest should be impossible — deployments_ready_has_image
      // enforces it — so treat it as a state worth a human, not as reclaimable.
      findings.push({
        ...base,
        disposition: "unknown",
        deploymentRef: ref,
        reclaimable: false,
        detail: `deployment is '${deployment.state}' with no image_digest; not classified`,
      });
      continue;
    }

    findings.push({
      ...base,
      disposition: "retain",
      deploymentRef: ref,
      reclaimable: false,
      detail:
        parsed.filename === "build.log"
          ? "build log — small, and a customer may read it long after the build"
          : `${parsed.filename} for ${ref}`,
    });
  }

  const empty = (): { objects: number; bytes: number } => ({ objects: 0, bytes: 0 });
  const byDisposition: Record<R2Disposition, { objects: number; bytes: number }> = {
    "in-flight": empty(),
    redundant: empty(),
    orphan: empty(),
    retain: empty(),
    unknown: empty(),
  };

  let totalBytes = 0;
  for (const f of findings) {
    totalBytes += f.bytes;
    byDisposition[f.disposition].objects += 1;
    byDisposition[f.disposition].bytes += f.bytes;
  }

  const reclaimableBytes = findings.filter((f) => f.reclaimable).reduce((n, f) => n + f.bytes, 0);
  const gb = (b: number) => b / 1024 ** 3;

  findings.sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));

  return {
    findings,
    totalBytes,
    reclaimableBytes,
    byDisposition,
    reclaimableMonthlyUsd: gb(reclaimableBytes) * R2_GB_MONTH_USD,
    totalMonthlyUsd: gb(totalBytes) * R2_GB_MONTH_USD,
    clean: reclaimableBytes === 0 && byDisposition.unknown.objects === 0,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
