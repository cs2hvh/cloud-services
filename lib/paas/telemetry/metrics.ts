/**
 * Per-app CPU and memory, from the metrics.k8s.io aggregated API.
 *
 * BUILT AHEAD OF ITS DEPENDENCY. metrics-server is not installed on the dev
 * cluster — `metrics.k8s.io` is absent from `/apis` — so nothing here has run
 * against real data yet. That is stated plainly rather than discovered later:
 * the parsing and aggregation below are unit-tested against the exact shapes
 * the API documents, and the I/O layer fails with a sentence rather than
 * zeros. Zeros are the dangerous outcome, because an idle app and a missing
 * metrics API look identical in a number.
 *
 * THE PART THAT WILL BITE IS QUANTITY PARSING, WHICH IS WHY IT IS HERE AND
 * NOT INLINE IN A ROUTE.
 *
 * Kubernetes quantities are not numbers. metrics-server reports CPU in
 * nanocores (`123456n`) and memory in kibibytes (`64512Ki`), and the same API
 * will happily return `1500m`, `2`, `1Gi`, `1e6` or `1M` depending on the
 * source. The decimal and binary suffixes differ by 2.4% at Gi and diverge
 * further up — treating `1Gi` as `1G` understates memory by 74 MB, which is
 * invisible per-pod and material across a fleet.
 *
 * Getting this wrong does not throw. It silently produces a number that looks
 * plausible, which is the same failure mode as pricing an unknown Linode type
 * at zero.
 *
 * Pure. No network.
 */

/** Decimal suffixes: powers of 1000. */
const DECIMAL: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  "": 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

/** Binary suffixes: powers of 1024. Note Ki is 1024, not 1000. */
const BINARY: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

/**
 * Parse a Kubernetes quantity into a plain number in base units — cores for
 * CPU, bytes for memory.
 *
 * Returns null for anything it does not understand, and callers must treat
 * null as "unknown", never as zero. A metric that silently reads zero is
 * indistinguishable from an idle app, and that is exactly the value a usage
 * report must never invent.
 */
export function parseQuantity(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const s = raw.trim();
  if (s === "") return null;

  // Binary suffixes are two characters and must be tested first: matching the
  // decimal table on "M" would silently accept "Mi" as 10^6.
  const binary = /^([+-]?[0-9.]+)(Ki|Mi|Gi|Ti|Pi|Ei)$/.exec(s);
  if (binary) {
    const n = Number(binary[1]);
    return Number.isFinite(n) ? n * BINARY[binary[2]] : null;
  }

  const decimal = /^([+-]?[0-9.]+)([numkMGTPE]?)$/.exec(s);
  if (decimal) {
    const n = Number(decimal[1]);
    return Number.isFinite(n) ? n * DECIMAL[decimal[2]] : null;
  }

  // Scientific notation, which the API permits: "1e6", "1.5e3".
  const exponent = /^[+-]?[0-9.]+e[+-]?[0-9]+$/i.exec(s);
  if (exponent) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

// ── what metrics.k8s.io returns ─────────────────────────────────────────────

export interface PodMetricsLike {
  metadata: { name: string; namespace: string };
  containers?: Array<{ name: string; usage?: { cpu?: string; memory?: string } }>;
}

export interface PodUsage {
  podName: string;
  namespace: string;
  /** Cores. null when the API reported something unparseable. */
  cpuCores: number | null;
  /** Bytes. null when unknown. */
  memoryBytes: number | null;
}

/**
 * Sum a pod's containers.
 *
 * A pod's usage is the sum across its containers, but a single unparseable
 * container poisons the pod's figure rather than being skipped — reporting
 * the sum of the containers we happened to understand would understate the
 * pod while looking precise.
 */
export function podUsage(m: PodMetricsLike): PodUsage {
  const containers = m.containers ?? [];
  let cpu: number | null = 0;
  let memory: number | null = 0;

  for (const c of containers) {
    const cores = parseQuantity(c.usage?.cpu);
    const bytes = parseQuantity(c.usage?.memory);
    cpu = cpu === null || cores === null ? null : cpu + cores;
    memory = memory === null || bytes === null ? null : memory + bytes;
  }

  return {
    podName: m.metadata.name,
    namespace: m.metadata.namespace,
    cpuCores: containers.length === 0 ? null : cpu,
    memoryBytes: containers.length === 0 ? null : memory,
  };
}

export interface DeploymentUsage {
  deploymentRef: string;
  namespace: string;
  pods: number;
  /** Cores summed across pods. null when any pod's figure is unknown. */
  cpuCores: number | null;
  memoryBytes: number | null;
  /** Pods whose usage could not be read. Cost is understated by these. */
  unreadable: number;
}

/**
 * Group pod usage by the deployment that owns it.
 *
 * `deploymentRefOf` is injected so this shares one convention with
 * `usage.ts` — the label is authoritative and the pod name is a fallback,
 * because v1 used name as the primary key of all infrastructure addressing
 * and the audit traced three critical findings to it.
 */
export function byDeployment(
  pods: PodUsage[],
  deploymentRefOf: (podName: string) => string,
): DeploymentUsage[] {
  const grouped = new Map<string, DeploymentUsage>();

  for (const p of pods) {
    const ref = deploymentRefOf(p.podName);
    const key = `${p.namespace}/${ref}`;
    const d =
      grouped.get(key) ??
      ({
        deploymentRef: ref,
        namespace: p.namespace,
        pods: 0,
        cpuCores: 0,
        memoryBytes: 0,
        unreadable: 0,
      } satisfies DeploymentUsage);

    d.pods += 1;
    if (p.cpuCores === null || p.memoryBytes === null) {
      d.unreadable += 1;
      d.cpuCores = null;
      d.memoryBytes = null;
    } else {
      if (d.cpuCores !== null) d.cpuCores += p.cpuCores;
      if (d.memoryBytes !== null) d.memoryBytes += p.memoryBytes;
    }

    grouped.set(key, d);
  }

  return [...grouped.values()].sort((a, b) => (b.cpuCores ?? -1) - (a.cpuCores ?? -1));
}

// ── formatting ──────────────────────────────────────────────────────────────

export function formatCores(n: number | null): string {
  if (n === null) return "unknown";
  return n < 1 ? `${(n * 1000).toFixed(0)}m` : `${n.toFixed(2)}`;
}

export function formatBytes(n: number | null): string {
  if (n === null) return "unknown";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

/**
 * Whether a pod is using enough of its request to be worth reporting.
 *
 * Deliberately NOT a signal on its own. Idle CPU is the expected state for the
 * plan's model — 80% of apps warm ~2% of the day — so "low CPU" describes a
 * healthy fleet rather than a problem. Sustained HIGH CPU across many hours is
 * the crypto-mining shape worth surfacing, and that needs a period of stored
 * samples rather than one reading.
 */
export const MINING_SHAPED_CORES = 0.9;
