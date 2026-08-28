/**
 * Scheduled sweeps as CronJobs — five narrow jobs, never one wide one.
 *
 * WHY FIVE. `scripts/v3/drift-sweep.ts` is an aggregator: it imports db (the
 * Supabase SERVICE ROLE), edge/cloudflare, build/r2, k8s/client, and through
 * fleet-source also linode/client. Scheduling *that* would put every platform
 * credential into a single pod — strictly more than v1's build stage held, and
 * that concentration was v1's cluster-wide RCE. It is never scheduled here; it
 * stays a manual tool.
 *
 * The leaf scripts are already separated by credential, so the split costs
 * almost nothing:
 *
 *   usage-sample    db + k8s        r2-drift    db + r2      (no cluster access)
 *   workload-drift  db + k8s        dns-drift   db + cf + k8s
 *   fleet-drift     linode          (no cluster, no db)
 *
 * Each job gets its own ServiceAccount and only the Secret it needs. No pod
 * ever holds more than one external credential.
 *
 * WHY IN-CLUSTER, given that. An observer running inside the thing it observes
 * cannot report on it when that thing breaks — a real cost. But the alternative
 * (a host outside the cluster) trades durability for it, and durability is the
 * whole point: the sweeps that ran before this were session-scoped and died
 * with the session that started them. Five narrow jobs get both.
 *
 * WHY THE SOURCE IS A ConfigMap. These are first-party TypeScript run under
 * `node --experimental-strip-types`, with zero npm dependencies. That means no
 * image build is needed — the same trick the activator uses. ConfigMap keys may
 * not contain `/`, but a volume's `items[].path` may, so flat keys are mapped
 * back onto the nested tree the imports expect.
 */

import { PAAS_NAMESPACE, ownerLabels } from "./manifests.ts";

/** Which credential sets a job needs. `k8s` is served by a ServiceAccount, not a Secret. */
export type SweepNeed = "db" | "k8s" | "r2" | "cf" | "linode";

export interface SweepJob {
  name: string;
  script: string;
  schedule: string;
  needs: SweepNeed[];
  why: string;
  /**
   * Whether the scheduled run is allowed to act, rather than only report.
   *
   * OFF FOR EVERYTHING BY DEFAULT, and each sweep that turns it on says why
   * at its own definition. A sweep that starts changing the world the moment
   * it is scheduled is the wrong shape for anything that deletes or bills.
   */
  apply?: boolean;
}

/**
 * Schedules are deliberately staggered and off the :00/:30 marks. Everything
 * firing on the same minute makes one spike against the Kubernetes API, the
 * Supabase REST endpoint and three vendor APIs at once, and makes correlating
 * a failure to a cause harder than it needs to be.
 */
export const SWEEP_JOBS: SweepJob[] = [
  {
    name: "usage-sample",
    script: "scripts/v3/usage-sample.ts",
    schedule: "*/15 * * * *",
    needs: ["db", "k8s"],
    why: "Warm-seconds and traffic on the same tick. Under flat pricing this is a margin and abuse signal rather than a price input, and it must be a history and not a snapshot.",
  },
  {
    name: "workload-drift",
    script: "scripts/v3/workload-drift.ts",
    schedule: "8,23,38,53 * * * *",
    needs: ["db", "k8s"],
    why: "Deployments in the cluster against paas.deployments, in POD units because the LKE cap counts pods.",
  },
  {
    name: "r2-drift",
    script: "scripts/v3/r2-drift.ts",
    schedule: "12 * * * *",
    needs: ["db", "r2"],
    why: "Build tarballs accumulate with every deploy and nothing else prunes them. Needs no cluster access at all.",
  },
  {
    name: "dns-drift",
    script: "scripts/v3/dns-drift.ts",
    schedule: "26 * * * *",
    needs: ["db", "cf", "k8s"],
    why: "DNS against Ingress against paas.aliases. Catches CLAIMABLE hostnames — a record pointing at the gateway that no Ingress routes, which the next Ingress to name it can capture.",
  },
  {
    name: "fleet-drift",
    script: "scripts/v3/fleet-drift.ts",
    schedule: "44 * * * *",
    // `db` is NOT visible in this script's direct imports — it arrives through
    // telemetry/fleet-source.ts, which calls assertControlPlaneReachable().
    // Deriving credentials from direct imports alone shipped this job without a
    // database and it refused to run, correctly: "paas schema unreachable —
    // refusing to reconcile. Every resource would report as unrecorded."
    // The transitive closure is the credential surface, not the import line.
    needs: ["db", "linode"],
    why: "Linode reality against the control plane, priced. The only job holding the Linode token, and the only one needing no cluster access.",
  },
  {
    name: "preview-reap",
    script: "scripts/v3/preview-reap.ts",
    schedule: "36 * * * *",
    // `db` for the index, `k8s` to answer whether a preview is actually RUNNING.
    // Installed with `db` alone first, and running it said so itself: "cluster
    // unreadable — running below is UNKNOWN, not no". That is the honest answer
    // and a useless one — an unindexed environment with a live pod is the urgent
    // case, and it cannot be told from a harmless empty one without looking.
    //
    // The k8s grant is the shared READ-ONLY ClusterRole: get and list, no delete.
    // This sweep must never gain write access; if it ever needs to remove
    // something, that belongs to the deploy lane behind a person.
    needs: ["db", "k8s"],
    why: "Previews are free and expire 48h after their last push. Nothing else bounds them, and an unreaped preview is a container running for nobody. REPORTS ONLY — there is no --apply, deliberately: this sweep deletes running environments if it is ever wrong, so the licence to delete stays with a person who has read the plan.",
  },
  {
    name: "netpolicy-drift",
    script: "scripts/v3/netpolicy-drift.ts",
    schedule: "51 * * * *",
    // No database at all — the whole transitive closure is the cluster.
    //
    // Reads networkpolicies and endpoints, NEITHER of which the shared reader
    // role granted before this. Both added narrowly, both read-only.
    //
    // VERIFIED UNDER DENIAL, which is the check that matters here: a sweep
    // reporting an unprotected fleet as protected is worse than no sweep.
    // Re-run against a ServiceAccount holding only the PRE-widening grants —
    // the sweep exactly as it would have run had the missing grants gone
    // unnoticed:
    //
    //   EXIT=1
    //   UNREADABLE  app-prj-...  policies could not be listed —
    //               this namespace is unevaluated, not protected
    //
    // Not exit 0, not "PROTECTED", not silence. The claim that it voids rather
    // than reports clean is now observed rather than inherited.
    needs: ["k8s"],
    why: "The tenant egress policy denies the control plane's CURRENT address, read from Endpoints at reconcile time. That address moves on an upgrade, rebuild or failover, and every deployed policy then silently stops covering it — nothing fails, the hole just reopens. Indexed by NAMESPACE rather than by policy, so a tenant with no policy at all is visible; walking policies asks whether the policies are correct, walking namespaces asks whether each tenant is protected, and only the second notices an absence.",
  },
  {
    name: "meter-apps",
    script: "scripts/v3/meter-apps.ts",
    // Hourly, a few minutes past, so the hour it bills has actually begun and
    // a pod started at :00 is observed rather than raced.
    schedule: "4 * * * *",
    needs: ["db", "k8s"],
    // NOTE: installed WITHOUT --apply, so it reports what it would bill and
    // charges nothing. Money moving is a decision with a person behind it, and
    // a sweep that starts deducting the moment it is scheduled is the wrong
    // shape for that. Flipping it on is one word in this script path.
    why: "Bills every running v2 app for the hour in progress. Without it, paas.charge_project_hour exists and nothing calls it, which is the same as not having it — every project ran free while usage_samples collected. Refuses to bill at all when the cluster cannot be read: an unreadable cluster is not an empty one, and under-billing is recoverable because the hour is keyed, while over-billing is money taken for work nobody verified.",
  },
  {
    name: "project-teardown",
    script: "scripts/v3/project-teardown.ts",
    schedule: "18 * * * *",
    needs: ["db", "k8s", "cf"],
    // APPLIES, since 2026-08-28, and this is the only sweep that does.
    //
    // It was report-only on the reasoning that a sweep should not start
    // destroying the moment it is scheduled. What changed is evidence: it had
    // 33 pending actions, every one of them a DNS record left behind by a
    // project its owner had already deleted, and running it by hand converged
    // to zero without touching anything live. Its own `why` below explains the
    // cost of leaving it off — the owner keeps paying for an app they deleted.
    //
    // The scope is what makes this safe rather than the intent: the query is
    // `deleted_at=not.is.null`, so a project that is live cannot be reached by
    // it at all. It is idempotent, so a missed run self-heals, and database
    // rows are kept because build history is what explains a bill.
    apply: true,
    why: "A soft-deleted project is INVISIBLE to reconcileAll, which iterates projects.list() and that filters deleted_at=is.null. So its pods keep running, its Ingress keeps routing, its DNS keeps resolving, and once metering is on its owner keeps paying for an app they deleted — v1's $543.17 defect reproduced exactly. Idempotent by construction, so a missed run is self-healing rather than permanent. Database rows are KEPT: build history is what explains a bill.",
  },
  {
    name: "domain-reconcile",
    script: "scripts/v3/domain-reconcile.ts",
    schedule: "33 * * * *",
    needs: ["db", "cf"],
    // REPORT ONLY, for the same reason.
    why: "DELETE on a custom domain soft-removes and promises 'the edge configuration is removed by the reconciler'. There was none, so every removed domain left a live Cloudflare custom hostname that nothing would ever clean up. Tears down only — issuance belongs to the claim path, where a customer is waiting and can be told what to add. Orphans are reported and NEVER deleted: a missing row is not proof a hostname is unwanted, and deleting a live custom domain cannot be undone by re-running.",
  },
];

/** Environment variables each credential set requires. Sourced from the operator's own env. */
export const NEED_ENV: Record<Exclude<SweepNeed, "k8s">, string[]> = {
  db: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  r2: [
    "V2_R2_ACCOUNT_ID",
    "V2_R2_BUCKET",
    "V2_R2_ENDPOINT",
    "V2_R2_ACCESS_KEY_ID",
    "V2_R2_SECRET_ACCESS_KEY",
  ],
  cf: ["V2_CF_API_TOKEN", "V2_CF_ACCOUNT_ID", "V2_CF_ZONE_ID", "V2_CF_ZONE_NAME"],
  linode: ["V2_LINODE_TOKEN", "V2_LINODE_REGION"],
};

export const SWEEP_SRC_CONFIGMAP = "paas-sweep-src";

/** ConfigMap keys must match [-._a-zA-Z0-9]+ — `/` is not allowed. */
export function flattenKey(path: string): string {
  return path.replace(/[/\\]/g, "_");
}

/**
 * One shared source ConfigMap. Sharing the *code* across jobs is safe in a way
 * that sharing credentials is not: a pod holding linode/client.ts without
 * V2_LINODE_TOKEN cannot reach Linode. Code without credentials is inert, so
 * the blast-radius argument is unaffected and five copies would be waste.
 */
export function sweepSourceConfigMap(files: Array<{ path: string; contents: string }>) {
  const data: Record<string, string> = {};
  for (const f of files) data[flattenKey(f.path)] = f.contents;
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: SWEEP_SRC_CONFIGMAP, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    data,
  };
}

/** Maps each flat key back onto the nested path the relative imports expect. */
export function sweepSourceItems(files: Array<{ path: string }>) {
  return files.map((f) => ({ key: flattenKey(f.path), path: f.path }));
}

export function sweepServiceAccount(job: SweepJob) {
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: `sweep-${job.name}`, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    // Only jobs that actually talk to the API server get a projected token.
    automountServiceAccountToken: job.needs.includes("k8s"),
  };
}

/**
 * Read-only, and only over the resources the sweeps actually read. A sweep that
 * could write would be able to repair drift it misreported, which is the
 * failure mode with no external witness.
 */
export function sweepClusterRole() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRole",
    metadata: { name: "paas-sweep-reader", labels: ownerLabels() },
    rules: [
      { apiGroups: [""], resources: ["pods", "services", "namespaces", "nodes"], verbs: ["get", "list"] },
      { apiGroups: ["apps"], resources: ["deployments", "replicasets"], verbs: ["get", "list"] },
      // `endpoints` and `networkpolicies` are read by netpolicy-drift, which
      // checks that every tenant still denies the control plane's CURRENT
      // address. Both read-only: this role must never gain a write verb, and
      // sweep-rbac.test.ts fails if it does.
      { apiGroups: [""], resources: ["endpoints"], verbs: ["get", "list"] },
      { apiGroups: ["networking.k8s.io"], resources: ["ingresses", "networkpolicies"], verbs: ["get", "list"] },
      { apiGroups: ["metrics.k8s.io"], resources: ["pods", "nodes"], verbs: ["get", "list"] },
    ],
  };
}

export function sweepClusterRoleBinding(jobs: SweepJob[]) {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: { name: "paas-sweep-reader", labels: ownerLabels() },
    roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "ClusterRole", name: "paas-sweep-reader" },
    subjects: jobs
      .filter((j) => j.needs.includes("k8s"))
      .map((j) => ({ kind: "ServiceAccount", name: `sweep-${j.name}`, namespace: PAAS_NAMESPACE })),
  };
}

/** One Secret per job, carrying only that job's credentials. */
export function sweepSecret(job: SweepJob, env: Record<string, string>) {
  const stringData: Record<string, string> = {};
  for (const need of job.needs) {
    if (need === "k8s") continue;
    for (const key of NEED_ENV[need]) {
      const v = env[key];
      if (v !== undefined && v !== "") stringData[key] = v;
    }
  }
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: `sweep-${job.name}`, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    type: "Opaque",
    stringData,
  };
}

/**
 * Exit codes that mean THE SWEEP WORKED, mapped to a zero pod exit.
 *
 * The observability lane's contract (lib/paas/telemetry/exit-codes.ts):
 *
 *   0   ran, nothing to report
 *   1   COULD NOT RUN — nothing measured; alert
 *   2   the instrument is wrong — self-check failed or input refused
 *   10  ran and FOUND something — the tool working, not failing
 *   11  ran and found something URGENT
 *
 * Kubernetes has one bit: zero or not. Without translation, r2-drift finding
 * 592 MB of reclaimable tarballs — the tool doing exactly its job — registers
 * as a failed Job, forever, and the noise buries a sweep that genuinely could
 * not reach its dependency. That already happened: sweep-r2-drift-29795952
 * exited non-zero having produced a complete, correct report.
 */
const FINDINGS_EXIT_CODES = [10, 11] as const;

/**
 * Build the container command, translating findings-exit-codes to success ONLY
 * when the shipped source actually carries the contract.
 *
 * This is the part that must not be guessed. Under the OLD contract, exit 1
 * meant "found drift"; under the new one it means "could not run". A mapping
 * applied to the wrong contract does not merely mislabel — it converts the
 * alert-worthy case into a green tick. So the caller passes what it OBSERVED
 * in the source closure, and when the contract is absent no translation
 * happens: every non-zero stays a failure, which is noisy and correct.
 */
export function sweepCommand(
  scriptPath: string,
  contractPresent: boolean,
  apply = false,
): string[] {
  const node = `node --experimental-strip-types /src/${scriptPath}${apply ? " --apply" : ""}`;
  if (!contractPresent) {
    // No contract: exit 1 is ambiguous, so nothing is translated. Findings will
    // show as failed Jobs until the contract ships — visibly wrong beats
    // silently wrong.
    return ["sh", "-c", node];
  }
  const cases = FINDINGS_EXIT_CODES.join("|");
  return [
    "sh",
    "-c",
    `${node}; c=$?; case $c in ${cases}) echo "[sweep] exit $c = ran and found something; reporting success"; exit 0;; *) exit $c;; esac`,
  ];
}

export function sweepCronJob(
  job: SweepJob,
  files: Array<{ path: string }>,
  srcHash: string,
  contractPresent: boolean,
) {
  const labels = ownerLabels({ "ahura.cloud/component": `sweep-${job.name}` });
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: {
      name: `sweep-${job.name}`,
      namespace: PAAS_NAMESPACE,
      labels,
      annotations: { "ahura.cloud/why": job.why },
    },
    spec: {
      schedule: job.schedule,
      // A sweep that overran its window must not stack: two concurrent samplers
      // would double-count interval deltas into paas.usage_samples.
      concurrencyPolicy: "Forbid",
      // If the cluster was unreachable at fire time, running late is worse than
      // not running — the next tick measures the current window correctly.
      startingDeadlineSeconds: 120,
      successfulJobsHistoryLimit: 2,
      failedJobsHistoryLimit: 4,
      jobTemplate: {
        spec: {
          // No retry. The drift scripts exit non-zero when they FIND something,
          // not only when they fail — `process.exit(report.clean ? 0 : 1)`. So a
          // "failed" sweep is usually a sweep that worked and found drift, and
          // retrying it re-runs a job that already recorded its observations.
          // The next tick is the retry.
          //
          // The cost of this overloading: a genuine error is indistinguishable
          // from findings by exit code alone. Separating them needs exit 1 for
          // error and a distinct code for findings, which lives in the
          // observability lane's scripts.
          backoffLimit: 0,
          activeDeadlineSeconds: 600,
          template: {
            metadata: {
              labels,
              // Kubernetes does not restart anything when a ConfigMap changes.
              // Without this a job would keep running stale source and the
              // symptom would be a fix that appears not to work.
              annotations: { "ahura.cloud/src-hash": srcHash },
            },
            spec: {
              serviceAccountName: `sweep-${job.name}`,
              automountServiceAccountToken: job.needs.includes("k8s"),
              restartPolicy: "Never",
              nodeSelector: { "ahura.cloud/pool": "system" },
              securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
              containers: [
                {
                  name: "sweep",
                  image: "node:24-alpine",
                  command: sweepCommand(job.script, contractPresent, job.apply === true),
                  workingDir: "/src",
                  envFrom: [{ secretRef: { name: `sweep-${job.name}` } }],
                  volumeMounts: [{ name: "src", mountPath: "/src", readOnly: true }],
                  resources: {
                    requests: { cpu: "50m", memory: "96Mi" },
                    limits: { cpu: "500m", memory: "384Mi" },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    capabilities: { drop: ["ALL"] },
                  },
                },
              ],
              volumes: [
                {
                  name: "src",
                  configMap: { name: SWEEP_SRC_CONFIGMAP, items: sweepSourceItems(files) },
                },
              ],
            },
          },
        },
      },
    },
  };
}
