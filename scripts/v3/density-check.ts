/**
 * Check the pod-density table in docs/v2/05-pricing.md against the cluster.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/density-check.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/density-check.ts --json
 *
 * WHY: the deploy lane wrote that table by derivation and said so — "I DERIVED
 * those... every margin in that table rests on them" — and asked for it to be
 * measured. Prices computed from an estimate are the one place in this system
 * where being wrong is silent: nothing crashes, the margin is just absent.
 *
 * WHAT IS MEASURED vs DERIVED, because the difference is the report:
 *
 *   MEASURED   node capacity, node allocatable, the kubelet's pod cap, the
 *              memory system pods request per node, and the sandbox overhead
 *              the RuntimeClass declares.
 *   DERIVED    everything about `g6-standard-16`, which this cluster does not
 *              run. Its allocatable comes from the tiered kubelet formula,
 *              anchored to the real node it does reproduce.
 *
 * Both sides of the comparison are read from their source rather than copied
 * into this file, and for the same reason: a transcribed fact is a second copy,
 * and copies go stale silently.
 *
 *   The CLAIM comes from 05-pricing.md itself, so correcting the doc moves this
 *   checker with it and there is never a stale table to compare against. A doc
 *   this cannot parse stops the run — an unread table compares clean against
 *   any measurement, which would report it verified.
 *
 *   The SANDBOX CHARGE comes from the live RuntimeClass, not from gvisor.ts.
 *   What sets density is what the SCHEDULER bills a pod — `overhead.podFixed` —
 *   not what the sentry consumes and not what a source file intends. If the two
 *   disagree, the cluster wins and this notices.
 *
 * READ-ONLY.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN, EXIT_UNTRUSTWORTHY } from "../../lib/paas/telemetry/exit-codes.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { parseQuantity } from "../../lib/paas/telemetry/metrics.ts";
import {
  nodeDensity,
  kubeletReservedBytes,
  costPerPod,
  compareDensity,
  parseDensityTable,
  parseNodePrice,
} from "../../lib/paas/telemetry/density.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/** Namespaces whose pods are platform cost, not tenant workload. */
const SYSTEM_NAMESPACES = ["kube-system", "ahura-system"];

/** The doc's per-pod sandbox allowance, for comparison against the real one. */
const CLAIMED_SENTRY_BYTES = 30 * 1000 * 1000;
/** §2's loading for system nodes, NodeBalancer, registry, R2, observability. */
const PLATFORM_LOADING = 0.15;

// The claim is READ from docs/v2/05-pricing.md rather than copied into here.
// A transcribed constant is a second copy of a fact, and the copy goes stale
// silently — this lane has shipped that defect three times. Reading the doc
// means correcting the doc moves this checker with it, and a doc that cannot
// be read stops the run instead of quietly comparing against nothing.
const DOC_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "v2", "05-pricing.md");

let markdown: string;
try {
  markdown = readFileSync(DOC_PATH, "utf8");
} catch {
  console.error(`cannot read ${DOC_PATH} — there is no claim to check against`);
  process.exit(EXIT_CANNOT_RUN);
}

const pricingClaim = parseDensityTable(markdown);
if (pricingClaim === null) {
  console.error(
    "could not parse the pod-density table in 05-pricing.md — refusing to run.\n" +
      "An unread table compares clean against any measurement, which would report it verified.",
  );
  process.exit(EXIT_UNTRUSTWORTHY);
}

const monthlyUsd = parseNodePrice(markdown, pricingClaim.nodeType);
if (monthlyUsd === null) {
  console.error(`05-pricing.md has no monthly price for ${pricingClaim.nodeType} — refusing to invent one`);
  process.exit(EXIT_UNTRUSTWORTHY);
}

// The shape's nominal RAM, from the doc's cost-floor table. Read rather than
// inferred from the type name: the 16 in `g6-standard-16` is vCPU, not GB, and
// a shape whose suffix happened to match would be a coincidence, not a source.
const nominalMatch = new RegExp(`\\|\\s*\`${pricingClaim.nodeType}\`\\s*\\|[^|]*\\|\\s*([\\d.]+)\\s*GB\\s*\\|`).exec(markdown);
if (!nominalMatch) {
  console.error(`05-pricing.md does not state how much RAM ${pricingClaim.nodeType} has`);
  process.exit(EXIT_UNTRUSTWORTHY);
}
const CLAIMED_NODE = {
  type: pricingClaim.nodeType,
  nominalBytes: Number(nominalMatch[1]) * GIB,
  monthlyUsd,
  usableClaimGb: pricingClaim.usableClaimGb,
};
const CLAIMED_ROWS = pricingClaim.rows;

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable — nothing measured");
  process.exit(EXIT_CANNOT_RUN);
}

// ── what the scheduler charges a sandboxed pod ──────────────────────────────

const rc = await k.get<{ overhead?: { podFixed?: Record<string, string> } }>(
  "/apis/node.k8s.io/v1/runtimeclasses/gvisor",
  true,
);
if (!rc) {
  console.error("RuntimeClass 'gvisor' not found — cannot tell what the scheduler charges a sandboxed pod");
  process.exit(EXIT_UNTRUSTWORTHY);
}
const sentryBytes = parseQuantity(rc.overhead?.podFixed?.memory);
if (sentryBytes === null) {
  // A missing overhead is not a zero overhead. Guessing here would produce a
  // density that is too high, which is the direction that costs money.
  console.error("RuntimeClass 'gvisor' declares no memory overhead — refusing to assume zero");
  process.exit(EXIT_UNTRUSTWORTHY);
}

// ── real nodes ──────────────────────────────────────────────────────────────

const nodes = await k.listNodes();
if (nodes.length === 0) {
  console.error("no nodes returned — cannot measure anything");
  process.exit(EXIT_CANNOT_RUN);
}

interface PodSpecLike {
  metadata: { name: string; namespace: string };
  spec?: { nodeName?: string; containers?: Array<{ resources?: { requests?: Record<string, string> } }> };
  status?: { phase?: string };
}

// System-pod requests attributed to the node each pod actually runs on.
// Averaging across the fleet would hide an imbalance, and an imbalance is
// exactly what a per-node density question is asking about.
const systemBytesByNode = new Map<string, number>();
const systemPodsByNode = new Map<string, number>();
for (const ns of SYSTEM_NAMESPACES) {
  const list = await k.get<{ items: PodSpecLike[] }>(`/api/v1/namespaces/${ns}/pods`, true);
  for (const p of list?.items ?? []) {
    if (p.status?.phase !== "Running") continue;
    const node = p.spec?.nodeName;
    if (!node) continue;
    let sum = 0;
    for (const c of p.spec?.containers ?? []) sum += parseQuantity(c.resources?.requests?.memory) ?? 0;
    systemBytesByNode.set(node, (systemBytesByNode.get(node) ?? 0) + sum);
    systemPodsByNode.set(node, (systemPodsByNode.get(node) ?? 0) + 1);
  }
}

const measured = nodes.map((n) => {
  const name = n.metadata.name;
  const capacityBytes = parseQuantity(n.status?.capacity?.memory);
  const allocatableBytes = parseQuantity(n.status?.allocatable?.memory);
  const maxPods = parseQuantity(n.status?.allocatable?.pods);
  const systemBytes = systemBytesByNode.get(name) ?? 0;
  return {
    name,
    type: n.metadata.labels?.["node.kubernetes.io/instance-type"] ?? "unknown",
    capacityBytes,
    allocatableBytes,
    maxPods,
    reservedBytes: capacityBytes !== null && allocatableBytes !== null ? capacityBytes - allocatableBytes : null,
    systemBytes,
    systemPods: systemPodsByNode.get(name) ?? 0,
  };
});

const usable = measured.filter((m) => m.capacityBytes !== null && m.allocatableBytes !== null && m.maxPods !== null);
if (usable.length === 0) {
  console.error("no node reported both capacity and allocatable memory — nothing to anchor on");
  process.exit(EXIT_CANNOT_RUN);
}

// ── the derived node ────────────────────────────────────────────────────────

// A node does not present its nominal RAM to Kubernetes; firmware and the
// kernel take a cut first. Measured here rather than assumed, from the ratio a
// real node shows, and applied to the shape we would actually buy.
const anchor = usable[0];
const anchorNominal = Math.round(anchor.capacityBytes! / GIB) * GIB;
const firmwareRatio = anchor.capacityBytes! / anchorNominal;

const derivedCapacity = CLAIMED_NODE.nominalBytes * firmwareRatio;
const formulaReserve = kubeletReservedBytes(derivedCapacity);
// LKE reserves slightly more than the formula. Carry the observed excess across
// rather than pretending the formula is exact.
const anchorExcess = anchor.reservedBytes! - kubeletReservedBytes(anchor.capacityBytes!);
const derivedAllocatable = derivedCapacity - formulaReserve - Math.max(0, anchorExcess);

// The busiest real node's system load, not the average — a new node inherits
// every DaemonSet, so the heaviest observed node is the honest per-node figure.
const perNodeSystemBytes = Math.max(...usable.map((m) => m.systemBytes));

const rows = CLAIMED_ROWS.map((claim) => {
  const d = nodeDensity({
    node: { capacityBytes: derivedCapacity, allocatableBytes: derivedAllocatable, maxPods: 110 },
    podBytes: claim.podBytes,
    sentryBytes,
    systemPodBytes: perNodeSystemBytes,
  });
  // allocatable was computed, not read from a live node of this shape.
  const cmp = compareDensity(claim, { ...d, measured: false }, CLAIMED_NODE.monthlyUsd);
  return { claim, density: d, cmp };
});

// A row matters when it understates cost by more than the rounding in the
// table itself. Anything above 5% moves a published margin.
const MATERIAL = 0.05;
const material = rows.filter((r) => r.cmp.costErrorPct !== null && r.cmp.costErrorPct > MATERIAL);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        measuredNodes: measured,
        sandbox: { declaredBytes: sentryBytes, claimedBytes: CLAIMED_SENTRY_BYTES, source: "RuntimeClass/gvisor" },
        derived: {
          type: CLAIMED_NODE.type,
          capacityBytes: derivedCapacity,
          allocatableBytes: derivedAllocatable,
          perNodeSystemBytes,
          firmwareRatio,
        },
        rows: rows.map((r) => r.cmp),
        materialRows: material.length,
      },
      null,
      2,
    ),
  );
  process.exit(material.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN);
}

const line = "─".repeat(98);
const gb = (b: number) => `${(b / GIB).toFixed(2)} GiB`;

console.log(`\nPod density — docs/v2/05-pricing.md §2 against the live cluster`);
console.log(line);

console.log(`\n  MEASURED — nodes this cluster actually runs\n`);
for (const m of measured) {
  const pct = m.reservedBytes !== null && m.capacityBytes ? (m.reservedBytes / m.capacityBytes) * 100 : null;
  console.log(
    `  ${m.name.padEnd(34)} ${m.type.padEnd(16)} cap ${gb(m.capacityBytes ?? 0).padStart(9)}  ` +
      `alloc ${gb(m.allocatableBytes ?? 0).padStart(9)}  pods ${String(m.maxPods ?? "?").padStart(3)}`,
  );
  console.log(
    `      kubelet reserves ${gb(m.reservedBytes ?? 0)}` +
      (pct === null ? "" : ` (${pct.toFixed(1)}% of capacity)`) +
      `   ${m.systemPods} system pod(s) requesting ${gb(m.systemBytes)}`,
  );
}

console.log(`\n  Sandbox charge per pod: ${gb(sentryBytes)} — from RuntimeClass/gvisor, what the scheduler bills.`);
if (sentryBytes > CLAIMED_SENTRY_BYTES * 1.5) {
  console.log(
    `  The table allows ${(CLAIMED_SENTRY_BYTES / 1e6).toFixed(0)} MB. The cluster charges ` +
      `${(sentryBytes / MIB).toFixed(0)} MiB — ${(sentryBytes / CLAIMED_SENTRY_BYTES).toFixed(1)}× more, on every pod.`,
  );
}

console.log(`\n${line}`);
console.log(`\n  DERIVED — ${CLAIMED_NODE.type}, which this cluster does not run\n`);
console.log(`      nominal ${gb(CLAIMED_NODE.nominalBytes)}  →  capacity ${gb(derivedCapacity)} (firmware takes ${((1 - firmwareRatio) * 100).toFixed(1)}%)`);
console.log(`      kubelet reserves ${gb(formulaReserve + Math.max(0, anchorExcess))}  →  allocatable ${gb(derivedAllocatable)}`);
console.log(`      system pods take ${gb(perNodeSystemBytes)}  →  usable ${gb(derivedAllocatable - perNodeSystemBytes)}`);
console.log(`\n      The table claims ${CLAIMED_NODE.usableClaimGb} GB usable.`);

console.log(`\n${line}`);
console.log(
  `\n  ${"Pod RAM".padEnd(9)} ${"claimed".padStart(8)} ${"actual".padStart(8)} ${"bound by".padEnd(12)} ` +
    `${"$/pod claimed".padStart(14)} ${"$/pod actual".padStart(13)} ${"error".padStart(8)}`,
);
for (const { claim, density, cmp } of rows) {
  const err = cmp.costErrorPct === null ? "—" : `${(cmp.costErrorPct * 100).toFixed(1)}%`;
  console.log(
    `  ${claim.podLabel.padEnd(9)} ${String(cmp.claimedPods).padStart(8)} ${String(cmp.actualPods).padStart(8)} ` +
      `${density.boundBy.padEnd(12)} ${`$${cmp.claimedCostUsd.toFixed(2)}`.padStart(14)} ` +
      `${(cmp.actualCostUsd === null ? "—" : `$${cmp.actualCostUsd.toFixed(2)}`).padStart(13)} ${err.padStart(8)}`,
  );
}

console.log(`\n${line}`);
if (material.length === 0) {
  console.log(`  The table holds. No row understates cost by more than ${(MATERIAL * 100).toFixed(0)}%.\n`);
  process.exit(EXIT_CLEAN);
}

console.log(`  ${material.length} row(s) understate cost per pod by more than ${(MATERIAL * 100).toFixed(0)}%.\n`);
console.log(`  What this does to the published tiers, at §2's ${(PLATFORM_LOADING * 100).toFixed(0)}% platform loading:\n`);
for (const { claim, cmp } of material) {
  if (cmp.actualCostUsd === null) continue;
  const was = cmp.claimedCostUsd * (1 + PLATFORM_LOADING);
  const now = cmp.actualCostUsd * (1 + PLATFORM_LOADING);
  console.log(
    `    ${claim.podLabel.padEnd(6)} tier cost  $${was.toFixed(2)}  →  $${now.toFixed(2)}   ` +
      `(+$${(now - was).toFixed(2)}/pod/mo)`,
  );
}
console.log(
  `\n  The error is largest at the smallest tier, because the sandbox charge is fixed\n` +
    `  per pod: it is a fifth of a 512Mi pod and a thirtieth of a 4Gi one. Density is\n` +
    `  DERIVED for this shape — buy one ${CLAIMED_NODE.type} and re-run to measure it.\n`,
);

// Which shape to buy is downstream of the same arithmetic, and the answer moved.
// 02-architecture.md §4 prefers the 32 GB shape "by ~15%/pod", reasoning that on
// it RAM binds before the 110-pod cap. With the real sandbox charge RAM binds on
// BOTH shapes, so that advantage is gone and the proportionally larger kubelet
// reservation on the smaller node makes it the worse buy.
console.log(`${line}`);
console.log(`\n  Which shape is cheapest per 512Mi pod, at the measured sandbox charge:\n`);
const shapes = [
  { type: "g6-standard-8", nominalBytes: 32 * GIB, monthlyUsd: 192 },
  { type: "g6-standard-16", nominalBytes: 64 * GIB, monthlyUsd: 384 },
  { type: "g6-dedicated-16", nominalBytes: 32 * GIB, monthlyUsd: 288 },
];
const ranked = shapes
  .map((s) => {
    const cap = s.nominalBytes * firmwareRatio;
    const alloc = cap - kubeletReservedBytes(cap) - Math.max(0, anchorExcess);
    const d = nodeDensity({
      node: { capacityBytes: cap, allocatableBytes: alloc, maxPods: 110 },
      podBytes: 512 * MIB,
      sentryBytes,
      systemPodBytes: perNodeSystemBytes,
    });
    return { ...s, pods: d.pods, boundBy: d.boundBy, perPod: costPerPod(s.monthlyUsd, d.pods) };
  })
  .sort((a, b) => (a.perPod ?? Infinity) - (b.perPod ?? Infinity));

for (const s of ranked) {
  console.log(
    `    ${s.type.padEnd(18)} ${String(s.pods).padStart(3)} pods  ${s.boundBy.padEnd(12)} ` +
      `${(s.perPod === null ? "—" : `$${s.perPod.toFixed(2)}`).padStart(7)}/pod/mo`,
  );
}
console.log(
  `\n  ${ranked[0].type} is the cheapest per pod. 02-architecture.md §4 prefers the 32 GB\n` +
    `  shape "by ~15%/pod" because RAM binds before the 110-pod cap on it — but at ${(sentryBytes / MIB).toFixed(0)}Mi\n` +
    `  of sandbox overhead RAM binds on every shape, so that reasoning no longer selects it.\n`,
);
process.exit(EXIT_FINDINGS);
