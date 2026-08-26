/**
 * What a gVisor sandbox actually costs, read from the kubelet's cAdvisor.
 *
 * WHY: `density.ts` shows the pricing table's margins turn on the sandbox
 * charge, and that charge is DECLARED (`RuntimeClass.overhead.podFixed`, 128Mi)
 * rather than observed. The scheduler bills the declaration, so if it is too
 * high the platform is throwing away density by its own configuration — no bug,
 * no alert, just fewer pods per node than the hardware allows.
 *
 * WHAT CAN AND CANNOT BE MEASURED, because the limit is the whole design:
 *
 * cAdvisor sees cgroups. A runc pod exposes one series per named container, so
 * per-container attribution works. A gVisor pod exposes NONE — the sentry runs
 * the application inside itself, so from the outside there is a single opaque
 * scope holding sentry, gofer and app together, and cAdvisor cannot name any
 * part of it.
 *
 * So the sentry's own footprint is NOT directly measurable, and this module
 * does not pretend otherwise. What it produces is a CEILING: the whole pod's
 * working set bounds every component of it. If the declared overhead exceeds
 * the entire pod's measured footprint, the declaration is too high — that
 * conclusion is sound without ever isolating the sentry.
 *
 * THE TRAP THIS MODULE EXISTS TO AVOID: summing named-container series to get
 * pod usage returns ZERO for every sandboxed pod, because there are none. Zero
 * reads as a free sandbox, which is the most flattering wrong answer available
 * and would argue for cutting the overhead to nothing. Absence of container
 * series on a sandboxed pod means UNREADABLE, never empty — this lane's
 * recurring defect, in the one place where it would have argued for a change to
 * production scheduling.
 *
 * Pure. Parses text someone else fetched.
 */

const WORKING_SET = "container_memory_working_set_bytes";

export interface Series {
  pod: string;
  namespace: string;
  container: string;
  id: string;
  bytes: number;
}

function label(line: string, name: string): string {
  const m = new RegExp(`(?:^|[,{])${name}="([^"]*)"`).exec(line);
  return m ? m[1] : "";
}

/**
 * Parse `container_memory_working_set_bytes` out of a cAdvisor scrape.
 *
 * Series without a pod label — the root cgroup, `/kubepods.slice` rollups — are
 * dropped: they are node totals, and adding them to a per-pod tally would
 * double-count the entire node.
 */
export function parseWorkingSet(text: string): Series[] {
  const out: Series[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith(WORKING_SET)) continue;
    const pod = label(line, "pod");
    if (!pod) continue;
    const bytes = Number(line.trim().split(/\s+/)[1]);
    if (!Number.isFinite(bytes)) continue;
    out.push({ pod, namespace: label(line, "namespace"), container: label(line, "container"), id: label(line, "id"), bytes });
  }
  return out;
}

/** A cgroup id ending in `.slice` is the pod itself; `.scope` is a container within it. */
function isPodSlice(id: string): boolean {
  return id.endsWith(".slice");
}

export interface PodFootprint {
  namespace: string;
  pod: string;
  /** The pod cgroup: everything the pod costs the node. Null when not reported. */
  wholePodBytes: number | null;
  /** Sum of series cAdvisor could attribute to a named container. */
  namedContainerBytes: number;
  /** How many named containers it saw. Zero on a sandboxed pod. */
  namedContainers: number;
  /**
   * True when the pod cgroup is reported but no named container is — the
   * signature of a sandbox cAdvisor cannot see into.
   */
  opaque: boolean;
}

export function podFootprints(series: Series[]): PodFootprint[] {
  const by = new Map<string, PodFootprint>();
  for (const s of series) {
    const key = `${s.namespace}/${s.pod}`;
    let f = by.get(key);
    if (!f) {
      f = { namespace: s.namespace, pod: s.pod, wholePodBytes: null, namedContainerBytes: 0, namedContainers: 0, opaque: false };
      by.set(key, f);
    }
    if (isPodSlice(s.id)) {
      // The pod slice is the authority on the total. Take the largest rather
      // than summing: the slice and the sandbox scope inside it report nearly
      // the same bytes on a sandboxed pod, and adding them doubles the answer.
      f.wholePodBytes = Math.max(f.wholePodBytes ?? 0, s.bytes);
    } else if (s.container !== "") {
      f.namedContainerBytes += s.bytes;
      f.namedContainers += 1;
    }
  }
  for (const f of by.values()) f.opaque = f.wholePodBytes !== null && f.namedContainers === 0;
  return [...by.values()];
}

export type OverheadVerdict =
  /** No cgroup data for this pod. Not a zero-cost pod — an unread one. */
  | "unobserved"
  /** Sandboxed and opaque: the whole-pod figure bounds the sandbox from above. */
  | "bounded"
  /** Named containers were visible, so this pod is not sandboxed. */
  | "not-sandboxed";

export interface OverheadReading {
  namespace: string;
  pod: string;
  verdict: OverheadVerdict;
  /** What the scheduler charges this pod for its sandbox. */
  declaredBytes: number;
  /** Everything the pod actually costs: sentry, gofer and app together. */
  wholePodBytes: number | null;
  /** Declared sandbox charge as a multiple of the ENTIRE pod's usage. */
  declaredVsWholePod: number | null;
  /**
   * True only when the declared sandbox charge alone exceeds the whole pod's
   * measured footprint — which cannot happen if the declaration is right.
   */
  declaredExceedsWholePod: boolean;
  note: string;
}

export function readOverhead(f: PodFootprint, declaredBytes: number): OverheadReading {
  const base = { namespace: f.namespace, pod: f.pod, declaredBytes, wholePodBytes: f.wholePodBytes };

  if (f.wholePodBytes === null) {
    return {
      ...base,
      verdict: "unobserved",
      declaredVsWholePod: null,
      declaredExceedsWholePod: false,
      note: "no pod cgroup series — the sandbox was not read, which is not the same as costing nothing",
    };
  }

  if (!f.opaque) {
    return {
      ...base,
      verdict: "not-sandboxed",
      declaredVsWholePod: null,
      declaredExceedsWholePod: false,
      note: `${f.namedContainers} named container(s) visible — cAdvisor can see inside, so this is not a gVisor sandbox`,
    };
  }

  const ratio = f.wholePodBytes > 0 ? declaredBytes / f.wholePodBytes : null;
  const exceeds = declaredBytes > f.wholePodBytes;
  return {
    ...base,
    verdict: "bounded",
    declaredVsWholePod: ratio,
    declaredExceedsWholePod: exceeds,
    note: exceeds
      ? "the declared sandbox charge alone is larger than the whole pod's working set, app included"
      : "declared charge is within the pod's total footprint; the sentry's own share is not separable",
  };
}

/**
 * What density would become if the declaration were changed.
 *
 * Deliberately does NOT recommend a value. The measurement bounds the sandbox
 * from above and cannot isolate the sentry, so picking a number from it would
 * be inventing precision the instrument does not have — and the number feeds
 * production scheduling, where too low means pods die under load.
 */
export function densityAtOverhead(usableBytes: number, podBytes: number, overheadBytes: number, maxPods: number): number {
  const per = podBytes + overheadBytes;
  return per > 0 ? Math.min(maxPods, Math.floor(usableBytes / per)) : 0;
}

// ── is the reservation still big enough ─────────────────────────────────────

/**
 * How close a pod is to the memory the scheduler set aside for it.
 *
 * WHY THIS IS THE SAFETY MONITOR FOR LOWERING podFixed. A load test measured
 * the sentry at 42-45 MiB against a 128Mi declaration, which argues for cutting
 * it — but a declaration has to hold for the worst moment of the worst tenant,
 * and one workload shape on an idle node cannot establish that. Under-declaring
 * produces no warning: the scheduler simply accepts more pods than the node can
 * hold and the kernel OOM-kills whichever allocates next, which may belong to a
 * different tenant than the one that caused it.
 *
 * So this watches the only thing observable in production — the whole pod
 * against its whole reservation — continuously, on real tenant workloads. It is
 * what makes a reduction reversible: if pods start running hot after one, this
 * says so before a node does.
 *
 * The sentry's share still is not separable. That does not matter here: if the
 * total fits, the split between app and sandbox is an accounting question, and
 * if it does not, the pod is at risk regardless of which half grew.
 */
export interface Headroom {
  namespace: string;
  pod: string;
  /** Sum of container memory requests. */
  requestedBytes: number;
  /** The sandbox charge the scheduler adds on top. */
  overheadBytes: number;
  /** What the scheduler set aside in total. */
  reservedBytes: number;
  /** What the pod actually uses, sandbox included. Null when unread. */
  wholePodBytes: number | null;
  /** Fraction of the reservation in use. Null when unread. */
  utilisation: number | null;
  /**
   * True when the pod is using more than was reserved for it. The node is then
   * holding more than the scheduler believes, and its remaining capacity is
   * overstated by the difference.
   */
  overReserved: boolean;
  note: string;
}

/**
 * Above this fraction of its reservation, a pod is worth naming. Not a failure
 * threshold — it is the level at which a further cut to podFixed would start
 * putting real pods at risk, which is the decision this feeds.
 */
export const HEADROOM_WARN = 0.85;

export function headroom(f: PodFootprint, requestedBytes: number, overheadBytes: number): Headroom {
  const reservedBytes = requestedBytes + overheadBytes;
  const base = {
    namespace: f.namespace,
    pod: f.pod,
    requestedBytes,
    overheadBytes,
    reservedBytes,
    wholePodBytes: f.wholePodBytes,
  };

  if (f.wholePodBytes === null) {
    // Unread, not idle. A pod reported at 0% utilisation would be the strongest
    // possible argument for cutting the reservation, on no evidence at all.
    return {
      ...base,
      utilisation: null,
      overReserved: false,
      note: "not read — contributes no evidence for or against the current reservation",
    };
  }

  const utilisation = reservedBytes > 0 ? f.wholePodBytes / reservedBytes : null;
  const over = f.wholePodBytes > reservedBytes;
  return {
    ...base,
    utilisation,
    overReserved: over,
    note: over
      ? "using more than was reserved — the node holds more than the scheduler accounted for"
      : utilisation !== null && utilisation >= HEADROOM_WARN
        ? "close to its reservation; a smaller sandbox charge would put this pod at risk"
        : "within its reservation",
  };
}

export interface HeadroomReport {
  pods: Headroom[];
  /** Highest utilisation actually observed. Null when nothing was read. */
  peakUtilisation: number | null;
  /** Pods at or above the warning level. */
  hot: number;
  /** Pods using more than was reserved for them. */
  overReserved: number;
  /** Pods that could not be read. Their absence is not evidence of headroom. */
  unread: number;
}

/**
 * Is there anything to report about the sandbox charge?
 *
 * WRITTEN AFTER THE CHECK TURNED ITSELF OFF. The report had two halves — a
 * ceiling saying the declaration was too big, and headroom saying whether pods
 * were near it — and the script returned "clean" as soon as the ceiling half
 * passed, skipping the other. That was harmless while the declaration was
 * oversized. The moment it was cut to 64Mi the ceiling went quiet, and the one
 * monitor standing between the smaller reservation and an OOM stopped printing
 * at exactly the point it started mattering.
 *
 * The two halves fail in opposite directions and neither implies the other:
 *
 *   ceilingExceeded   the declaration is bigger than any pod's whole footprint.
 *                     Costs money — density given away — and is recoverable
 *                     whenever someone gets to it.
 *   hot / overReserved
 *                     pods are near or past what was set aside for them. Ends
 *                     in the kernel OOM-killing whichever pod allocates next,
 *                     possibly a different tenant's than the one at fault.
 *
 * So a clean ceiling never suppresses a hot pod. A safety check that goes
 * silent once the risky change is made is worse than no check, because its
 * silence reads as reassurance.
 */
export function sandboxHasFindings(ceilingExceeded: number, report: HeadroomReport): boolean {
  return ceilingExceeded > 0 || report.hot > 0 || report.overReserved > 0;
}

export function headroomReport(pods: Headroom[]): HeadroomReport {
  const read = pods.filter((p) => p.utilisation !== null);
  return {
    // Hottest first: the pod that constrains the decision is the one to see.
    pods: [...pods].sort((a, b) => (b.utilisation ?? -1) - (a.utilisation ?? -1)),
    peakUtilisation: read.length > 0 ? Math.max(...read.map((p) => p.utilisation!)) : null,
    hot: read.filter((p) => p.utilisation! >= HEADROOM_WARN).length,
    overReserved: pods.filter((p) => p.overReserved).length,
    unread: pods.length - read.length,
  };
}
