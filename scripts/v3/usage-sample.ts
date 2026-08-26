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
import {
  aggregatePeriod,
  fleetWarmSummary,
  periodWarmFraction,
  sampleDelta,
  toSampleRows,
  type StoredSample,
} from "../../lib/paas/telemetry/usage-store.ts";
import { byDeployment, podUsage, type PodMetricsLike } from "../../lib/paas/telemetry/metrics.ts";
import { parseRouterCounts, requestsForHostname } from "../../lib/paas/idle.ts";
import { classifyTraffic, warmthJustified, type TrafficReading } from "../../lib/paas/telemetry/traffic.ts";
import { IDLE_CORES } from "../../lib/paas/telemetry/signals.ts";

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

/**
 * --record writes one row per app per interval to paas.usage_samples.
 *
 * The only write this script makes, and it is append-only. Off by default so
 * the sampler can be run to look at something without leaving a trail, but ON
 * is the intended production mode: warm fraction is a property of a DAY, and
 * without persistence it exists only for the lifetime of one process.
 */
const RECORD = process.argv.includes("--record");

/** --period <hours> reads a stored period back instead of sampling. */
const PERIOD_HOURS = arg("period", 0);

/** Namespaces the platform runs for itself, never a tenant's. */
const PLATFORM_NS = new Set(["default", "kube-system", "kube-public", "kube-node-lease", "ahura-system", "platform"]);

/** Where the gateway runs, for reading its router counters. */
const PAAS_NAMESPACE = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";

// ── --period: read a stored period back, no sampling ────────────────────────
//
// The whole point of persisting. A few minutes of live sampling proves the
// meter works; only stored samples can answer what the warm fraction was
// yesterday, which is the number the plan's economics turn on.

if (PERIOD_HOURS > 0) {
  const end = new Date();
  const start = new Date(end.getTime() - PERIOD_HOURS * 3600 * 1000);
  const seconds = PERIOD_HOURS * 3600;

  let rows: StoredSample[];
  try {
    rows = await db.select<StoredSample>(
      "usage_samples",
      `select=*&sampled_at=gte.${start.toISOString()}&order=sampled_at&limit=100000`,
    );
  } catch {
    console.error(
      `\npaas.usage_samples is not reachable, so there is no stored period to read.\n` +
        `The migration has not been applied yet. Until it is, warm fraction exists\n` +
        `only for the lifetime of one sampler process — run without --period.\n`,
    );
    process.exit(1);
  }
  const usage = aggregatePeriod(rows, start, end);
  const fleet = fleetWarmSummary(usage, seconds);

  // CPU is read NOW, while warmth is measured over the period. Labelled as
  // such below rather than implied: an app can be idle this second and have
  // been busy an hour ago. It is a strong enough indicator to separate
  // warm-and-serving from warm-and-idle, which is the distinction the price
  // turns on — but it is not a period measurement and must not read as one.
  const cpuNow = new Map<string, number | null>();
  try {
    const k = kube(loadKubeconfig(KUBECONFIG));
    const list = await k.get<{ items: PodMetricsLike[] }>("/apis/metrics.k8s.io/v1beta1/pods", true);
    for (const d of byDeployment((list?.items ?? []).map(podUsage), (n) =>
      n.split("-").slice(0, -2).join("-") || n,
    )) {
      cpuNow.set(d.deploymentRef, d.cpuCores);
    }
  } catch {
    // metrics-server unreachable. Warm fraction still stands on its own.
  }

  const bar = "─".repeat(96);
  console.log(`\nStored usage over the last ${PERIOD_HOURS}h (${rows.length} sample rows)`);
  console.log(bar);
  let warmAndIdle = 0;
  for (const u of usage) {
    const w = periodWarmFraction(u, seconds);
    const cpu = cpuNow.get(u.deploymentRef);
    const idle = typeof cpu === "number" && cpu < IDLE_CORES;
    if (w.alwaysWarm && idle) warmAndIdle += 1;

    console.log(
      `  ${u.deploymentRef.padEnd(22)} ${u.podSeconds.toFixed(0).padStart(9)} pod-s  ` +
        `${(w.fraction * 100).toFixed(1).padStart(6)}% warm  ` +
        `${(typeof cpu === "number" ? `${(cpu * 1000).toFixed(0)}m` : "—").padStart(6)} cpu  ` +
        `peak ${String(u.peakPods).padStart(3)}  ${u.samples} sample(s)` +
        (w.degraded ? "  DEGRADED — gaps in observation" : "") +
        (w.alwaysWarm && idle ? "  WARM AND IDLE" : w.alwaysWarm ? "  ALWAYS WARM" : ""),
    );
  }
  if (usage.length === 0) console.log(`  no samples in this window — has the sampler been running?`);
  console.log(bar);
  console.log(
    `  ${fleet.apps} app(s)   mean warm ${(fleet.meanFraction * 100).toFixed(1)}%   ` +
      `${fleet.alwaysWarm} always-warm   ${warmAndIdle} warm AND idle   ${fleet.degraded} degraded`,
  );
  console.log(
    `  (warm is measured over the period; CPU is read now — see the note in the source)`,
  );
  console.log(
    `\n  The plan prices on this number: ~$52k/month always-on ($5.20/app) against\n` +
      `  $18-20k idle-to-zero ($2.30-$3.62/app), at a $5 price. Weighted per APP,\n` +
      `  because the model is a distribution over apps rather than over compute.\n`,
  );
  process.exit(0);
}

const ctx = loadKubeconfig(KUBECONFIG);
const k = kube(ctx);

if (!(await k.healthz())) {
  console.error("cluster unreachable");
  process.exit(1);
}

/** Project refs → ids, so stored samples can be attributed to a bill. */
const projectIdOf = new Map(
  (await db.select<{ id: string; ref: string }>("projects", "select=id,ref")).map((p) => [p.ref, p.id]),
);

// Fail before sampling, not after. Discovering the table is missing on the
// second interval means the first interval's measurement is already lost, and
// a scheduler would silently drop a sample every run while looking like it
// worked — which is v1's meter-that-never-ran wearing a different hat.
if (RECORD) {
  try {
    await db.select("usage_samples", "select=id&limit=1");
  } catch {
    console.error(
      `\npaas.usage_samples is not reachable, so --record cannot store anything.\n` +
        `The migration has not been applied yet. Run without --record to sample\n` +
        `and report live, which needs no table.\n`,
    );
    process.exit(1);
  }
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

/**
 * Hostname → the deployment currently serving it, from paas.aliases.
 *
 * Lets a hostname's request shape be joined to the pod that request keeps
 * warm, which is the join the whole economics question turns on. A hostname
 * with no alias row is skipped rather than guessed at.
 */
const hostnameToDeployment = new Map<string, string>();
{
  const refOfId = new Map(
    (await db.select<{ id: string; ref: string }>("deployments", "select=id,ref")).map((d) => [d.id, d.ref]),
  );
  for (const a of await db.select<{ hostname: string; deployment_id: string | null }>(
    "aliases",
    "select=hostname,deployment_id",
  )) {
    const ref = a.deployment_id ? refOfId.get(a.deployment_id) : undefined;
    if (ref) hostnameToDeployment.set(a.hostname.toLowerCase(), ref);
  }
}

/**
 * Router counters, sampled on the SAME schedule as pod usage.
 *
 * Traffic and warmth measured over one window rather than two is what makes
 * the join honest. The alternative — a period warm fraction beside an
 * instantaneous CPU reading — compares a day to a second and quietly invites
 * the reader to treat them as the same measurement.
 *
 * Null on any failure, never an empty map: an empty map reads as "every
 * hostname had zero requests", which would make a busy fleet look abandoned.
 */
async function routerCounts(): Promise<Map<string, number> | null> {
  try {
    const pods = await k.listPods(PAAS_NAMESPACE);
    const pod = pods.find((p) => p.metadata.name.startsWith("traefik-"));
    if (!pod) return null;
    const body = await k.raw<string>({
      method: "GET",
      path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${pod.metadata.name}:8080/proxy/metrics`,
      raw: true,
    });
    return parseRouterCounts(String(body));
  } catch {
    return null;
  }
}

const trafficReadings = new Map<string, TrafficReading[]>();

let buckets = new Map<string, UsageBucket>();
let previousAt: Date | null = null;
const startedAt = new Date();

let written = 0;

for (let i = 0; i < SAMPLES; i += 1) {
  const observations = await takeSample();
  const now = new Date();

  // Same instant as the pod observation above, so warmth and traffic describe
  // the same window rather than two that merely overlap.
  const counts = await routerCounts();
  if (counts !== null) {
    for (const [hostname, ref] of hostnameToDeployment) {
      const n = requestsForHostname(counts, hostname);
      // No router for this hostname is not zero requests for it. Skip rather
      // than record a zero that would read as measured quiet.
      if (n === null) continue;
      const list = trafficReadings.get(ref) ?? [];
      list.push({ at: now.getTime(), cumulative: n });
      trafficReadings.set(ref, list);
    }
  }

  // Two folds of the same observation, and the difference matters.
  //
  // `buckets` carries totals forward for this process's own report.
  // `sampleDelta` starts from an empty Map, so the row written below contains
  // ONLY this interval. Persisting the running total instead would make every
  // row include everything since startup, and summing a period would count the
  // first interval N times — an app warm for an hour billing thirty.
  buckets = accumulate(buckets, observations, { now, previousAt });

  if (RECORD) {
    const rows = toSampleRows(sampleDelta(observations, { now, previousAt }), now, {
      projectIdOf: (b) => projectIdOf.get(b.projectRef) ?? null,
      // The window this row measures, not the configured interval — a slow
      // sample makes the real period longer than --interval claims.
      periodSeconds: previousAt === null ? 0 : (now.getTime() - previousAt.getTime()) / 1000,
    });
    if (rows.length) {
      await db.insert("usage_samples", rows);
      written += rows.length;
    }
  }

  previousAt = now;

  if (!JSON_OUT) {
    const running = observations.reduce((n, o) => n + o.pods.length, 0);
    process.stdout.write(
      `  sample ${String(i + 1).padStart(3)}/${SAMPLES}  ` +
        `${observations.length} app(s), ${running} running pod(s)` +
        (RECORD ? `, ${written} row(s) written` : "") +
        `\n`,
    );
  }
  if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}

const endedAt = new Date();
const periodSeconds = Math.max(1, (endedAt.getTime() - startedAt.getTime()) / 1000);

// ── build minutes, exact from recorded lifetimes ────────────────────────────

const vmRows = await db.select<BuildVmLifetime>(
  "build_vms",
  "select=ref,deployment_id,created_at,destroyed_at,instance_type,expires_at&order=created_at",
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

  // The join: warmth costs money, and only traffic says whether the money is
  // buying anything. Both measured over this same window.
  const shape = classifyTraffic(trafficReadings.get(bucket.appKey) ?? []);
  if (shape.shape !== "undetermined") {
    notes.push(shape.shape.toUpperCase());
    const w = warmthJustified(shape.shape);
    if (warm.alwaysWarm && w.justified === false) notes.push("warmth NOT justified");
  }

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
    (builds.inFlight ? `, ${builds.inFlight} in flight` : "") +
    (builds.overdue ? `, ${builds.overdue} PAST DEADLINE and still billing` : ""),
);
console.log(
  `\n  NOT MEASURED: bandwidth. The only honest source is the gateway, which sees\n` +
    `  requests to the app; a pod's network counters cannot tell a user download from\n` +
    `  an npm install, and v1 billed customers for their own database traffic that way.\n`,
);
