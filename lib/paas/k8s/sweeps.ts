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
    why: "Warm-seconds and traffic on the same tick. The warm-time pricing decision rests on this series, so it must be a history and not a snapshot.",
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
      { apiGroups: ["networking.k8s.io"], resources: ["ingresses"], verbs: ["get", "list"] },
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

export function sweepCronJob(job: SweepJob, files: Array<{ path: string }>, srcHash: string) {
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
                  command: ["node", "--experimental-strip-types", `/src/${job.script}`],
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
