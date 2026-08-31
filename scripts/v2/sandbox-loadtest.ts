/**
 * What does the gVisor sandbox actually cost a pod UNDER LOAD?
 *
 * WHY A LOAD TEST AND NOT A SCRAPE. `scripts/v3/sandbox-overhead.ts` measured
 * the three live apps at 66–93 MiB total against a 128 MiB declaration. That
 * establishes a CEILING and says so: those apps are idle, and the sentry's cost
 * is not fixed. It grows with syscall traffic and the gofer's with file I/O,
 * because that is what they are for. Reserving from an idle reading is how a
 * node ends up accepting more pods than it can hold — and the failure is not a
 * slow app, it is an OOM kill on whichever pod allocates next, possibly a
 * different tenant's.
 *
 * WHY A/B, AND WHY THE OBVIOUS METHOD IS WRONG.
 *
 * The first version of this script had the workload report its own RSS from
 * inside and subtracted it from the pod's working set:
 *
 *     sandbox = pod working set (outside) − application RSS (inside)     ← WRONG
 *
 * It produced NEGATIVE overhead: app 330 MiB, pod 252 MiB, sandbox −78 MiB.
 * Inside a sandbox, `process.memoryUsage().rss` is what the SENTRY reports to
 * the application in its virtualised view of memory — it is not host cgroup
 * accounting, and the two are not in the same frame of reference. Subtracting
 * one from the other is meaningless.
 *
 * The absurd sign is the only reason that was caught. Had the two numbers been
 * closer, it would have produced a plausible figure and someone would have
 * lowered `podFixed` on the strength of it.
 *
 * So both readings now come from OUTSIDE, in one frame of reference: the same
 * workload run twice, once sandboxed and once not, measured through cAdvisor
 * both times.
 *
 *     sandbox = working set (gvisor) − working set (runc)
 *
 * Run:  node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *         scripts/v2/sandbox-loadtest.ts [--hold-mib 192] [--seconds 70]
 */

import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import { parseWorkingSet, podFootprints } from "../../lib/paas/telemetry/sandbox.ts";

const argv = process.argv.slice(2);
const num = (flag: string, dflt: number) => {
  const i = argv.indexOf(`--${flag}`);
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
};

const HOLD_MIB = num("hold-mib", 192);
const SECONDS = num("seconds", 70);
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const MiB = 1024 * 1024;

/**
 * Exercises the two things a sandbox taxes: SYSCALLS, which the sentry
 * intercepts one by one, and FILE I/O, which the gofer proxies out of the
 * sandbox. Idle apps do almost neither, which is why the scrape reads low.
 */
const WORKLOAD = `
const fs = require('node:fs');
const held = Buffer.alloc(${HOLD_MIB} * 1024 * 1024);
// Touch every page — an untouched Buffer is virtual and never accounted, which
// would make both arms look smaller and the difference between them noisier.
for (let i = 0; i < held.length; i += 4096) held[i] = 1;
const scratch = '/tmp/sbx';
try { fs.mkdirSync(scratch, { recursive: true }); } catch {}
const chunk = Buffer.alloc(64 * 1024, 7);
let ticks = 0;
const timer = setInterval(() => {
  for (let i = 0; i < 40; i++) { const p = scratch + '/f' + (i % 8); fs.writeFileSync(p, chunk); fs.readFileSync(p); }
  for (let i = 0; i < 4000; i++) { fs.existsSync(scratch); process.hrtime.bigint(); }
  console.log('TICK ' + (++ticks));
}, 2000);
setTimeout(() => { clearInterval(timer); console.log('DONE'); }, ${SECONDS} * 1000);
`;

function testPod(name: string, sandboxed: boolean) {
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, namespace: PAAS_NAMESPACE, labels: { "ahura.cloud/component": "sandbox-loadtest" } },
    spec: {
      // The ONLY difference between the two arms. Everything else — image,
      // command, requests, limits, node pool — is identical, so the difference
      // in working set is attributable to the sandbox and nothing else.
      ...(sandboxed ? { runtimeClassName: "gvisor" } : {}),
      restartPolicy: "Never",
      nodeSelector: { "ahura.cloud/pool": "runtime" },
      tolerations: [{ key: "ahura.cloud/runtime", operator: "Equal", value: "true", effect: "NoSchedule" }],
      securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
      containers: [
        {
          name: "load",
          image: "node:24-alpine",
          command: ["node", "-e", WORKLOAD],
          resources: {
            requests: { cpu: "200m", memory: `${HOLD_MIB + 256}Mi` },
            limits: { cpu: "1", memory: `${HOLD_MIB + 512}Mi` },
          },
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
        },
      ],
    },
  };
}

const k = kube(loadKubeconfig(KUBECONFIG));

async function workingSet(node: string, pod: string): Promise<number | null> {
  const text = await k.raw<string>({ method: "GET", path: `/api/v1/nodes/${node}/proxy/metrics/cadvisor` });
  const f = podFootprints(parseWorkingSet(String(text))).find((x) => x.namespace === PAAS_NAMESPACE && x.pod === pod);
  return f ? f.wholePodBytes : null;
}

/** Run one arm and return its peak and median working set, measured externally. */
async function runArm(name: string, sandboxed: boolean): Promise<{ peak: number; median: number; n: number } | null> {
  console.log(`\n── ${sandboxed ? "SANDBOXED (gvisor)" : "PLAIN (runc)"} ─────────────────────────────`);
  await k.delete(`/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${name}?gracePeriodSeconds=0`);
  await new Promise((r) => setTimeout(r, 4000));
  await k.apply(`/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${name}`, testPod(name, sandboxed));

  let node = "";
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const p = await k.get<{ status?: { phase?: string }; spec?: { nodeName?: string } }>(
      `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${name}`, true,
    );
    if (p?.status?.phase === "Running") { node = p.spec?.nodeName ?? ""; break; }
    if (p?.status?.phase === "Failed") { console.error(`  ${name} failed to start`); return null; }
  }
  if (!node) { console.error(`  ${name} never reached Running`); return null; }
  console.log(`  on ${node}`);

  const samples: number[] = [];
  const deadline = Date.now() + (SECONDS + 15) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const ws = await workingSet(node, name);
    const log = await k
      .raw<string>({ method: "GET", path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${name}/log?tailLines=1`, allowMissing: true })
      .catch(() => null);
    if (ws !== null && ws > 0) {
      samples.push(ws);
      console.log(`    working set ${(ws / MiB).toFixed(1).padStart(7)} MiB`);
    }
    if (String(log ?? "").includes("DONE")) break;
  }
  await k.delete(`/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${name}?gracePeriodSeconds=0`);

  if (samples.length < 3) { console.error(`  only ${samples.length} sample(s)`); return null; }
  const sorted = [...samples].sort((a, b) => a - b);
  return { peak: sorted[sorted.length - 1], median: sorted[Math.floor(sorted.length / 2)], n: samples.length };
}

console.log(`gVisor sandbox A/B — identical workload holding ${HOLD_MIB} MiB, ${SECONDS}s of syscall and file-I/O pressure`);
console.log("Both arms measured from OUTSIDE via cAdvisor, so the two readings share one frame of reference.");

// Sequential, never concurrent: two copies of this workload on one node would
// compete for page cache and CPU and each would distort the other's reading.
const sandboxArm = await runArm("sandbox-loadtest-gvisor", true);
const plainArm = await runArm("sandbox-loadtest-runc", false);

if (!sandboxArm || !plainArm) {
  console.error("\nOne arm did not produce usable samples — refusing to report a difference.");
  process.exit(1);
}

const peakDelta = sandboxArm.peak - plainArm.peak;
const medianDelta = sandboxArm.median - plainArm.median;

console.log("\n──────────────────────────────────────────────────────────────────");
console.log(`  gvisor   peak ${(sandboxArm.peak / MiB).toFixed(1).padStart(7)} MiB   median ${(sandboxArm.median / MiB).toFixed(1).padStart(7)} MiB   (${sandboxArm.n} samples)`);
console.log(`  runc     peak ${(plainArm.peak / MiB).toFixed(1).padStart(7)} MiB   median ${(plainArm.median / MiB).toFixed(1).padStart(7)} MiB   (${plainArm.n} samples)`);
console.log(`\n  SANDBOX COST  peak ${(peakDelta / MiB).toFixed(1)} MiB   median ${(medianDelta / MiB).toFixed(1)} MiB`);
console.log(`  declared      128.0 MiB`);

if (peakDelta <= 0) {
  console.log("\n  The sandboxed arm did not measure higher than the plain one.");
  console.log("  That is not a free sandbox — it is a workload that does not stress it,");
  console.log("  or noise larger than the effect. Do NOT lower podFixed on this result.");
  process.exit(1);
}

// Headroom on the PEAK, not the median: podFixed is a reservation, and it has to
// hold for the worst moment of the worst tenant, not the typical one.
const suggested = Math.ceil((peakDelta * 1.5) / MiB / 16) * 16;
console.log(`\n  peak + 50% headroom, rounded to 16 MiB: ${suggested} MiB`);
console.log(
  suggested >= 128
    ? "  -> 128Mi is NOT over-declared under load. Leave it and reprice instead."
    : `  -> room to lower podFixed 128Mi -> ${suggested}Mi. Re-run on a busier node before applying.`,
);
