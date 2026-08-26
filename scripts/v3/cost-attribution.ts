/**
 * What each app costs us against what it pays, and whether it fits its tier.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/cost-attribution.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/cost-attribution.ts --json
 *
 * Under warm-time pricing an app that ran hot paid more, so consumption and
 * revenue moved together and nobody had to watch. Flat pricing severs that
 * link on purpose — the customer pays the same whether the app sleeps or pins
 * its ceiling all month — which makes per-app consumption something that has to
 * be measured rather than inferred from the invoice.
 *
 * READ-ONLY.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { requireTier, tierById } from "../../lib/paas/tiers.ts";
import { parseQuantity, podUsage, type PodMetricsLike } from "../../lib/paas/telemetry/metrics.ts";
import { attributeApp, attributeFleet, type AppAttribution } from "../../lib/paas/telemetry/attribution.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable — nothing measured");
  process.exit(EXIT_CANNOT_RUN);
}

interface ProjectRow {
  id: string;
  ref: string;
  tier: string | null;
  instance_count: number | null;
  deleted_at: string | null;
}
const projects = (
  await db.select<ProjectRow>("projects", "select=id,ref,tier,instance_count,deleted_at")
).filter((p) => !p.deleted_at);

if (projects.length === 0) {
  console.error("no projects — nothing to attribute");
  process.exit(EXIT_CANNOT_RUN);
}

interface PodSpec {
  metadata: { name: string; namespace: string };
  spec?: { containers?: Array<{ resources?: { requests?: Record<string, string>; limits?: Record<string, string> } }> };
  status?: { phase?: string };
}

// Tenant namespaces are per project: app-prj-<hex>. Derived from the project
// ref rather than by scanning namespaces, so a namespace nobody has a row for
// shows up as unaccounted in workload-drift rather than being silently
// attributed to whichever project sorts first.
const nsOf = (ref: string) => `app-prj-${ref.replace(/^prj-/, "")}`;

// metrics.k8s.io, once, for the whole fleet. A namespace missing from it means
// unreadable, never idle.
const metricsByNs = new Map<string, PodMetricsLike[]>();
let metricsAvailable = true;
try {
  const all = await k.get<{ items: PodMetricsLike[] }>("/apis/metrics.k8s.io/v1beta1/pods");
  for (const m of all?.items ?? []) {
    const list = metricsByNs.get(m.metadata.namespace) ?? [];
    list.push(m);
    metricsByNs.set(m.metadata.namespace, list);
  }
} catch {
  // Recorded, not swallowed. Every app will carry an `unobserved` finding and
  // the report says why once, rather than looking like a quiet fleet.
  metricsAvailable = false;
}

const attributions: AppAttribution[] = [];
const skipped: string[] = [];

for (const p of projects) {
  const tier = p.tier ? tierById(p.tier) : null;
  if (!tier) {
    // Refusing rather than defaulting to Starter. Attributing a Pro customer's
    // consumption against Starter economics would report a healthy margin on
    // an app we might be losing money on.
    skipped.push(`${p.ref}: tier ${JSON.stringify(p.tier)} is not a known tier`);
    continue;
  }

  const ns = nsOf(p.ref);
  const pods = await k.get<{ items: PodSpec[] }>(`/api/v1/namespaces/${ns}/pods`, true);
  const running = (pods?.items ?? []).filter((x) => x.status?.phase === "Running");

  // The app container's request, not the sum — the tier describes one
  // container, and a sidecar would make the sum disagree with the tier by
  // design rather than by drift.
  const first = running[0]?.spec?.containers?.[0];
  const podMemoryBytes = first ? parseQuantity(first.resources?.requests?.memory) : null;
  const podCpuLimitCores = first ? parseQuantity(first.resources?.limits?.cpu) : null;

  const usages = (metricsByNs.get(ns) ?? []).map(podUsage);
  const readable = usages.filter((u) => u.cpuCores !== null && u.memoryBytes !== null);
  const unreadablePods = running.length - readable.length;

  attributions.push(
    attributeApp({
      projectRef: p.ref,
      tier,
      instanceCount: p.instance_count ?? 1,
      runningPods: running.length,
      podMemoryBytes,
      podCpuLimitCores,
      usedCpuCores: readable.length > 0 ? readable.reduce((n, u) => n + (u.cpuCores ?? 0), 0) : null,
      usedMemoryBytes: readable.length > 0 ? readable.reduce((n, u) => n + (u.memoryBytes ?? 0), 0) : null,
      unreadablePods: Math.max(0, unreadablePods),
    }),
  );
}

const fleet = attributeFleet(attributions);

if (JSON_OUT) {
  console.log(JSON.stringify({ ...fleet, metricsAvailable, skipped }, null, 2));
  process.exit(fleet.withFindings > 0 || skipped.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN);
}

const line = "─".repeat(100);
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);

console.log(`\nCost attribution — ${fleet.apps.length} app(s) against their tiers`);
console.log(line);
if (!metricsAvailable) {
  console.log(`  metrics.k8s.io unreadable — every app below is unobserved, not idle.\n`);
}

console.log(
  `  ${"project".padEnd(22)} ${"tier".padEnd(10)} ${"pods".padStart(5)} ${"price".padStart(8)} ` +
    `${"cost".padStart(8)} ${"margin".padStart(8)} ${"cpu".padStart(6)} ${"mem".padStart(6)}`,
);
for (const a of fleet.apps) {
  console.log(
    `  ${a.projectRef.padEnd(22)} ${a.tierId.padEnd(10)} ${String(a.runningPods).padStart(5)} ` +
      `${`$${a.priceUsd.toFixed(2)}`.padStart(8)} ${`$${a.costUsd.toFixed(2)}`.padStart(8)} ` +
      `${`$${a.marginUsd.toFixed(2)}`.padStart(8)} ${pct(a.cpuUtilisation).padStart(6)} ${pct(a.memoryUtilisation).padStart(6)}`,
  );
  for (const f of a.findings) {
    console.log(`      ${f.kind.toUpperCase().padEnd(16)} ${f.detail}`);
    if (f.against !== "neither") console.log(`      ${"".padEnd(16)} against the ${f.against}`);
  }
}

if (skipped.length) {
  console.log(`\n  ${skipped.length} project(s) not attributed — refusing to guess a tier:`);
  for (const s of skipped) console.log(`    ${s}`);
}

console.log(`\n${line}`);
console.log(
  `  revenue $${fleet.priceUsd.toFixed(2)}/mo   cost $${fleet.costUsd.toFixed(2)}/mo   ` +
    `margin $${fleet.marginUsd.toFixed(2)}/mo` +
    (fleet.priceUsd > 0 ? ` (${((fleet.marginUsd / fleet.priceUsd) * 100).toFixed(0)}%)` : ""),
);
if (fleet.unprofitable > 0) {
  console.log(`  ${fleet.unprofitable} app(s) cost more than they pay.`);
}
if (fleet.unobserved > 0) {
  console.log(
    `  ${fleet.unobserved} app(s) unobserved — their consumption is unknown, not low, and the\n` +
      `  margin above is therefore an upper bound rather than a measurement.`,
  );
}
console.log(
  `\n  Cost per app is its tier's measured cost (05-pricing.md §2), not this app's\n` +
    `  own share of a node — density sets the price, so an app costs its tier whether\n` +
    `  it is busy or idle. What varies, and what this watches, is whether the app\n` +
    `  still fits the tier it is on.\n`,
);

// Assigned, not called. `process.exit()` here aborted on Windows with a libuv
// assertion after printing the report in full — the shell saw 127, a crash,
// rather than the verdict. Assigning lets Node drain stdout and exit with the
// code intact. See preview-reap.ts for the same fix and the full note.
process.exitCode = fleet.withFindings > 0 || skipped.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN;
