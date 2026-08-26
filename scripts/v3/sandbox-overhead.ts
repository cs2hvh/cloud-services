/**
 * Measure what a gVisor sandbox actually costs, against what we charge for it.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/sandbox-overhead.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/sandbox-overhead.ts --json
 *
 * `density-check.ts` shows that the sandbox charge sets the margin on the small
 * tiers. That charge is DECLARED in RuntimeClass.overhead.podFixed and the
 * scheduler bills it whether or not it is right, so an over-declaration costs
 * density silently — nothing fails, there are simply fewer pods per node than
 * the hardware allows.
 *
 * This reads the kubelet's cAdvisor for every sandboxed pod and reports the
 * declaration against the pod's real footprint.
 *
 * WHAT IT CANNOT DO, stated up front: it cannot isolate the sentry. cAdvisor
 * sees cgroups, and a gVisor pod is one opaque cgroup containing sentry, gofer
 * and application together — that opacity is the product working. So the output
 * is a CEILING, not a figure. If the declared charge exceeds the whole pod's
 * usage it is provably too high; if it does not, this cannot say what is.
 *
 * It therefore proposes no replacement value. Too low a reservation kills pods
 * under load, and that number must come from a load test, not a scrape.
 *
 * READ-ONLY.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN, EXIT_UNTRUSTWORTHY } from "../../lib/paas/telemetry/exit-codes.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { parseQuantity } from "../../lib/paas/telemetry/metrics.ts";
import { parseWorkingSet, podFootprints, readOverhead, densityAtOverhead } from "../../lib/paas/telemetry/sandbox.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");
const MIB = 1024 ** 2;

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable — nothing measured");
  process.exit(EXIT_CANNOT_RUN);
}

const rc = await k.get<{ overhead?: { podFixed?: Record<string, string> } }>(
  "/apis/node.k8s.io/v1/runtimeclasses/gvisor",
  true,
);
const declared = parseQuantity(rc?.overhead?.podFixed?.memory);
if (declared === null) {
  console.error("RuntimeClass 'gvisor' declares no memory overhead — nothing to check against");
  process.exit(EXIT_UNTRUSTWORTHY);
}

// Which pods are actually sandboxed, from their spec rather than their
// namespace — a tenant pod that opted out of gVisor must not be judged as one.
interface P {
  metadata: { name: string; namespace: string };
  spec?: { runtimeClassName?: string; nodeName?: string; containers?: Array<{ resources?: { requests?: Record<string, string> } }> };
  status?: { phase?: string };
}
const allPods = await k.get<{ items: P[] }>("/api/v1/pods", true);
const sandboxed = new Map<string, P>();
for (const p of allPods?.items ?? []) {
  if (p.status?.phase !== "Running") continue;
  if (p.spec?.runtimeClassName !== "gvisor") continue;
  sandboxed.set(`${p.metadata.namespace}/${p.metadata.name}`, p);
}

if (sandboxed.size === 0) {
  console.error("no running sandboxed pods — nothing to measure");
  process.exit(EXIT_CANNOT_RUN);
}

// Scrape every node that holds one. A node that refuses is recorded as
// unreadable rather than skipped silently, so a partial scrape cannot read as
// a complete one.
const wanted = [...new Set([...sandboxed.values()].map((p) => p.spec?.nodeName).filter((n): n is string => !!n))];
const series = [];
const unreadable: string[] = [];
for (const node of wanted) {
  try {
    const body = await k.raw<string>({ method: "GET", path: `/api/v1/nodes/${node}/proxy/metrics/cadvisor` });
    series.push(...parseWorkingSet(String(body)));
  } catch {
    unreadable.push(node);
  }
}

if (series.length === 0) {
  console.error(`no cAdvisor data from any of ${wanted.length} node(s) — nothing measured`);
  process.exit(EXIT_CANNOT_RUN);
}

const footprints = new Map(podFootprints(series).map((f) => [`${f.namespace}/${f.pod}`, f]));
const readings = [...sandboxed.keys()].map((key) => {
  const f = footprints.get(key) ?? {
    namespace: key.split("/")[0],
    pod: key.split("/").slice(1).join("/"),
    wholePodBytes: null,
    namedContainerBytes: 0,
    namedContainers: 0,
    opaque: false,
  };
  const pod = sandboxed.get(key)!;
  const requested = (pod.spec?.containers ?? []).reduce(
    (sum, c) => sum + (parseQuantity(c.resources?.requests?.memory) ?? 0),
    0,
  );
  return { ...readOverhead(f, declared), requestedBytes: requested };
});

const bounded = readings.filter((r) => r.verdict === "bounded");
const over = bounded.filter((r) => r.declaredExceedsWholePod);
const unobserved = readings.filter((r) => r.verdict === "unobserved");

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { declaredBytes: declared, unreadableNodes: unreadable, readings, overDeclared: over.length },
      null,
      2,
    ),
  );
  process.exit(over.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN);
}

const line = "─".repeat(98);
const mib = (b: number | null) => (b === null ? "—" : `${(b / MIB).toFixed(1)} MiB`);

console.log(`\nSandbox overhead — RuntimeClass/gvisor declares ${mib(declared)} per pod`);
console.log(line);
if (unreadable.length) {
  console.log(`  ${unreadable.length} node(s) would not serve cAdvisor: ${unreadable.join(", ")}`);
  console.log(`  Pods on them are reported unobserved below, not as zero.\n`);
}

console.log(
  `  ${"namespace/pod".padEnd(56)} ${"requests".padStart(10)} ${"whole pod".padStart(11)} ${"declared/actual".padStart(16)}`,
);
for (const r of readings) {
  const key = `${r.namespace}/${r.pod}`;
  const ratio = r.declaredVsWholePod === null ? "—" : `${r.declaredVsWholePod.toFixed(2)}x`;
  console.log(
    `  ${key.slice(0, 56).padEnd(56)} ${mib(r.requestedBytes).padStart(10)} ${mib(r.wholePodBytes).padStart(11)} ${ratio.padStart(16)}`,
  );
  if (r.verdict !== "bounded") console.log(`      ${r.verdict.toUpperCase()} — ${r.note}`);
}

console.log(`\n${line}`);
if (unobserved.length) {
  console.log(`  ${unobserved.length} sandboxed pod(s) unobserved — the sandbox was not read, not read as free.\n`);
}

if (over.length === 0) {
  console.log(
    `  The declared charge is within every measured pod's footprint. This cannot\n` +
      `  confirm it is right — the sentry is not separable from the app inside the\n` +
      `  sandbox — only that nothing here proves it wrong.\n`,
  );
  process.exit(EXIT_CLEAN);
}

const worst = over.reduce((a, b) => ((a.wholePodBytes ?? 0) > (b.wholePodBytes ?? 0) ? a : b));
console.log(
  `  ${over.length} of ${bounded.length} sandboxed pod(s) cost LESS IN TOTAL — sentry, gofer and\n` +
    `  application together — than the sandbox charge alone. The heaviest uses ${mib(worst.wholePodBytes)}\n` +
    `  against a ${mib(declared)} declaration, so the sentry's true cost is below that ceiling.\n`,
);

// What the declaration is worth, in the only terms that matter here. Framed as
// a sensitivity, not a recommendation: the ceiling does not name a safe value.
const usable = 55.77 * 1024 * MIB; // g6-standard-16, from density-check.ts
console.log(`  What density on a g6-standard-16 would do at other declarations, for 512Mi pods:\n`);
for (const mibValue of [128, 96, 64, 32]) {
  const pods = densityAtOverhead(usable, 512 * MIB, mibValue * MIB, 110);
  const perPod = 384 / pods;
  const tier = perPod * 1.15;
  console.log(
    `    ${String(mibValue).padStart(3)}Mi  ${String(pods).padStart(3)} pods  $${perPod.toFixed(2)}/pod  ` +
      `→ tier cost $${tier.toFixed(2)}` +
      (mibValue === Math.round(declared / MIB) ? "   ← declared today" : ""),
  );
}
console.log(
  `\n  NOT a recommendation. Reserving too little kills pods under load, and the\n` +
    `  safe figure comes from a load test, not a scrape. What this establishes is\n` +
    `  that ${mib(declared)} is above the ceiling, so there is room worth measuring for.\n`,
);
process.exit(EXIT_FINDINGS);
