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
