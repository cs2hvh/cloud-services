/**
 * Sample live usage and report the warm fraction.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/usage-sample.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/usage-sample.ts --samples 5 --interval 20
 *   node --env-file=.env --env-file=.env.local scripts/v3/usage-sample.ts --json
 *
 * THIS IS THE SAMPLER, AND IT IS A SCRIPT ON PURPOSE. In production it belongs
 * behind a scheduler — a cron entry, a Deployment with a loop, anything that
 * runs whether or not a human is awake. What it must NEVER be is something a
 * page render triggers. v1 metered bandwidth only when a customer opened their
 * own dashboard, so an app nobody visited was never metered and never billed;
 * that defect is a property of where collection is invoked from, not of the
 * arithmetic, so the arithmetic being correct here is not the safeguard.
 *
 * A short run measures a short window. The warm fraction is a property of a
 * DAY, and the plan's economics turn on the difference between 2% and 100% of
 * one. Treat a few minutes of sampling as proof the meter works, not as the
 * number the business case needs.
 *
 * READ-ONLY. GETs against the Kubernetes API and the paas schema.
 */

import { db } from "../../lib/paas/db.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import {
  accumulate,
  buildUsage,
  deploymentRefFromPod,
  observeNamespace,
  warmFraction,
  type AppObservation,
  type BuildVmLifetime,
  type PodLike,
  type UsageBucket,
} from "../../lib/paas/telemetry/usage.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const SAMPLES = Math.min(arg("samples", 2), 200);
const INTERVAL_S = Math.min(arg("interval", 15), 300);

/** Namespaces the platform runs for itself, never a tenant's. */
const PLATFORM_NS = new Set(["default", "kube-system", "kube-public", "kube-node-lease", "ahura-system", "platform"]);

const ctx = loadKubeconfig(KUBECONFIG);
const k = kube(ctx);

if (!(await k.healthz())) {
  console.error("cluster unreachable");
  process.exit(1);
}

async function takeSample(): Promise<AppObservation[]> {
  const namespaces = (await k.listNamespaces())
    .map((n) => n.metadata.name)
    .filter((n) => !PLATFORM_NS.has(n));

  const out: AppObservation[] = [];
  for (const ns of namespaces) {
    const pods = (await k.listPods(ns)) as unknown as PodLike[];
    // Namespaces are minted as `app-<projectRef>`; the project is what a bill
    // is addressed to, so carry it rather than re-deriving it downstream.
    const projectRef = ns.startsWith("app-") ? ns.slice(4) : ns;
    out.push(...observeNamespace(ns, projectRef, pods, deploymentRefFromPod));
  }
  return out;
}

let buckets = new Map<string, UsageBucket>();
let previousAt: Date | null = null;
const startedAt = new Date();

for (let i = 0; i < SAMPLES; i += 1) {
  const observations = await takeSample();
  const now = new Date();
  buckets = accumulate(buckets, observations, { now, previousAt });
  previousAt = now;

  if (!JSON_OUT) {
    const running = observations.reduce((n, o) => n + o.pods.length, 0);
    process.stdout.write(
      `  sample ${String(i + 1).padStart(3)}/${SAMPLES}  ` +
        `${observations.length} app(s), ${running} running pod(s)\n`,
    );
  }
  if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}

const endedAt = new Date();
const periodSeconds = Math.max(1, (endedAt.getTime() - startedAt.getTime()) / 1000);

// ── build minutes, exact from recorded lifetimes ────────────────────────────

const vmRows = await db.select<BuildVmLifetime>(
  "build_vms",
  "select=ref,deployment_id,created_at,destroyed_at,instance_type&order=created_at",
);
const dayStart = new Date(endedAt.getTime() - 24 * 3600 * 1000);
const builds = buildUsage(vmRows, dayStart, endedAt);

const rows = [...buckets.values()]
  .map((b) => ({ bucket: b, warm: warmFraction(b, periodSeconds) }))
  .sort((a, b) => b.warm.fraction - a.warm.fraction || b.bucket.podSeconds - a.bucket.podSeconds);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        window: { startedAt, endedAt, periodSeconds, samples: SAMPLES, intervalSeconds: INTERVAL_S },
        apps: rows.map((r) => ({ ...r.bucket, warmFraction: r.warm.fraction, alwaysWarm: r.warm.alwaysWarm, degraded: r.warm.degraded })),
        builds: { ...builds, windowHours: 24 },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const line = "─".repeat(96);
console.log(`\nUsage over ${periodSeconds.toFixed(0)}s (${SAMPLES} samples, ${INTERVAL_S}s apart)`);
console.log(line);
console.log(
  `  ${"deployment".padEnd(20)} ${"project".padEnd(30)} ${"pod-s".padStart(8)} ` +
    `${"warm-s".padStart(8)} ${"warm%".padStart(7)} ${"pods".padStart(5)}  notes`,
);
console.log(line);

for (const { bucket, warm } of rows) {
  const notes: string[] = [];
  if (warm.alwaysWarm) notes.push("ALWAYS WARM");
  if (warm.degraded) notes.push("degraded — gaps in observation");
  if (bucket.restarts > 0) notes.push(`${bucket.restarts} restart(s)`);

  console.log(
    `  ${bucket.appKey.padEnd(20)} ${bucket.projectRef.slice(0, 30).padEnd(30)} ` +
      `${bucket.podSeconds.toFixed(0).padStart(8)} ${bucket.warmSeconds.toFixed(0).padStart(8)} ` +
      `${(warm.fraction * 100).toFixed(1).padStart(6)}% ${String(bucket.peakPods).padStart(5)}  ${notes.join("; ")}`,
  );
}

console.log(line);
const totalPodSeconds = rows.reduce((n, r) => n + r.bucket.podSeconds, 0);
const alwaysWarm = rows.filter((r) => r.warm.alwaysWarm).length;

console.log(`  ${rows.length} app(s), ${totalPodSeconds.toFixed(0)} pod-seconds this window`);
console.log(
  `  ${alwaysWarm} of ${rows.length} warm for the whole window` +
    (rows.length
      ? `  —  at this rate the fleet costs the always-on model, not the idle-to-zero one`
      : ""),
);
console.log(
  `\n  builds in the last 24h: ${builds.builds}, ` +
    `${(builds.buildSeconds / 60).toFixed(1)} build-minutes, ` +
    `longest ${(builds.longestSeconds / 60).toFixed(1)}m` +
    (builds.unterminated ? `, ${builds.unterminated} with no destroyed_at (billed as zero)` : ""),
);
console.log(
  `\n  NOT MEASURED: bandwidth. The only honest source is the gateway, which sees\n` +
    `  requests to the app; a pod's network counters cannot tell a user download from\n` +
    `  an npm install, and v1 billed customers for their own database traffic that way.\n`,
);
