/**
 * Which previews the reaper can see, and which it cannot.
 *
 * WHY THIS IS INDEXED BY ENVIRONMENT. `planReap` takes aliases, so a preview
 * with no alias is neither reaped nor kept — it is never examined and no TTL
 * applies to it. The alias is minted at DEPLOY time rather than when the
 * environment is created, so every failed and in-flight build sits in that
 * window. Walking aliases lets the reaper's own index decide what exists, and a
 * preview missing from it is invisible rather than overdue.
 *
 * The environment row is the thing that cannot be missing: it is written from
 * the webhook, before any build runs. So it is the honest index.
 *
 * A SECOND REASON, found the expensive way. The first version of the sweep
 * filtered aliases on `kind === "preview"`. There is no such kind —
 * `paas.alias_kind` is `('production','branch','deployment','custom')` and a
 * preview alias is `branch`. It would have examined zero aliases forever and
 * reported that honestly. Indexing by environment removes the dependency on the
 * alias kind altogether: whatever alias points at a preview environment's
 * deployment is that preview's alias, whatever it happens to be called.
 *
 * Pure. Takes rows someone else read.
 */

export interface EnvironmentLike {
  id: string;
  ref: string;
  projectRef: string;
  kind: string;
  name: string;
  createdAt: string;
}

export interface DeploymentLike {
  id: string;
  ref: string;
  environmentId: string | null;
  /** When the push arrived. The TTL measures from this. */
  queuedAt: string | null;
}

export interface AliasLike {
  ref: string;
  hostname: string;
  deploymentId: string | null;
}

/** A preview the reaper can see: it has an alias, so `planReap` will classify it. */
export interface IndexedPreview {
  environmentRef: string;
  projectRef: string;
  aliasRef: string;
  hostname: string;
  /** Newest queued_at across the environment's deployments. */
  lastPushAt: string | null;
}

/**
 * What an unindexed preview is actually doing, which decides whether it is a
 * finding at all.
 *
 * WHY THIS EXISTS — a false-positive generator, caught before it ran. The
 * reaper deletes the DNS record and the alias row, converges, and DELIBERATELY
 * LEAVES THE ENVIRONMENT ROW: environments are reused per branch, so the row is
 * the branch's identity and re-pushing reuses it. Correct.
 *
 * But it means every successfully reaped preview becomes an environment with no
 * alias — indistinguishable, structurally, from one whose alias was never
 * minted. Reporting "no alias" as the finding would have produced one permanent
 * entry per reaped preview, accumulating forever, and drowning the case that
 * actually matters underneath its own successes.
 *
 * So the finding is not "no alias". It is "no alias AND something is running".
 */
export type InvisibleDisposition =
  /** A pod with no alias. Real cost, and no TTL reaches it. */
  | "running"
  /** Nothing running. Either already reaped, or a build that never routed. */
  | "idle"
  /** The cluster could not be read, so this cannot be called either way. */
  | "unknown";

/** A preview the reaper cannot see: no alias, so no TTL reaches it. */
export interface InvisiblePreview {
  environmentRef: string;
  projectRef: string;
  name: string;
  /** From the last push, falling back to when the environment was created. */
  ageHours: number | null;
  deployments: number;
  /** True, false, or NULL when the cluster could not be read. */
  running: boolean | null;
  disposition: InvisibleDisposition;
  /**
   * A running pod with no alias. Routing precedes the converge step, so a pod
   * normally arrives AFTER its alias — one without means something ran between
   * those two points and did not finish, and no sweep will ever reach it.
   */
  urgent: boolean;
  /**
   * Whether a person should look. False for `idle`, which is the expected
   * resting state of a reaped preview and costs nothing.
   */
  actionable: boolean;
}

export interface PreviewIndex {
  indexed: IndexedPreview[];
  invisible: InvisiblePreview[];
  /** Every preview environment, however it was classified. */
  environments: number;
}

export interface IndexInput {
  environments: EnvironmentLike[];
  deployments: DeploymentLike[];
  aliases: AliasLike[];
  /**
   * Whether a deployment has a running pod. Returning NULL means the cluster
   * could not be read, and null must not collapse to false — that would
   * downgrade the urgent case to a footnote on the strength of a failed API
   * call.
   */
  hasPod: (deploymentRef: string) => boolean | null;
  now: Date;
}

export function indexPreviews(input: IndexInput): PreviewIndex {
  const { environments, deployments, aliases, hasPod, now } = input;

  const previewEnvs = environments.filter((e) => e.kind === "preview");
  const aliasesByDeployment = new Map<string, AliasLike[]>();
  for (const a of aliases) {
    if (!a.deploymentId) continue;
    const list = aliasesByDeployment.get(a.deploymentId) ?? [];
    list.push(a);
    aliasesByDeployment.set(a.deploymentId, list);
  }

  const indexed: IndexedPreview[] = [];
  const invisible: InvisiblePreview[] = [];

  for (const env of previewEnvs) {
    const deps = deployments.filter((d) => d.environmentId === env.id);
    const als = deps.flatMap((d) => aliasesByDeployment.get(d.id) ?? []);
    const pushes = deps.map((d) => d.queuedAt).filter((t): t is string => !!t).sort();
    const lastPushAt = pushes.at(-1) ?? null;

    if (als.length > 0) {
      indexed.push({
        environmentRef: env.ref,
        projectRef: env.projectRef,
        aliasRef: als[0].ref,
        hostname: als[0].hostname,
        lastPushAt,
      });
      continue;
    }

    // Unknown beats false: one unreadable deployment makes the whole
    // environment's pod state unknown rather than letting the readable ones
    // vote it down to "nothing running".
    const perDeployment = deps.map((d) => hasPod(d.ref));
    const running = perDeployment.some((x) => x === true)
      ? true
      : perDeployment.some((x) => x === null)
        ? null
        : false;

    const disposition: InvisibleDisposition = running === true ? "running" : running === null ? "unknown" : "idle";

    invisible.push({
      environmentRef: env.ref,
      projectRef: env.projectRef,
      name: env.name,
      ageHours: ageHours(lastPushAt ?? env.createdAt, now),
      deployments: deps.length,
      running,
      disposition,
      urgent: running === true,
      // `unknown` is actionable because it cannot be shown to be safe — not
      // because it is known to be unsafe. `idle` is not, because a reaped
      // preview rests here and one permanent entry per success is how a report
      // stops being read.
      actionable: disposition !== "idle",
    });
  }

  return { indexed, invisible, environments: previewEnvs.length };
}

/**
 * Age in hours, or null when the stamp cannot be read.
 *
 * Null rather than 0, and rather than Infinity. Zero would make an unreadable
 * environment look brand new and safe; Infinity would make it look ancient and
 * reapable. Both are answers, and the honest output is that there isn't one.
 */
export function ageHours(stamp: string | null, now: Date): number | null {
  if (!stamp) return null;
  const t = Date.parse(stamp);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}
