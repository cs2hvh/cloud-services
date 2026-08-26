/**
 * Per-tenant resource bounds: what a namespace may consume, and whether it is
 * safe to start enforcing that.
 *
 * NOTHING BOUNDS A TENANT TODAY. One namespace can request as much of a node
 * as the scheduler will give it, and at untrusted-public-signup scale that is
 * one hostile tenant away from being every other tenant's problem.
 *
 * THE DANGEROUS PART IS NOT THE NUMBERS. It is applying them.
 *
 * Kubernetes ACCEPTS a ResourceQuota smaller than current usage. Existing pods
 * keep running, nothing errors, the object looks applied and correct — and
 * then the next deploy or the next restart is rejected. The outage is
 * delayed, it lands on whoever happened to push next, and nothing in the
 * quota's own status says "this is already violated".
 *
 * So this module's real job is the precondition, not the manifest: measure
 * what the namespace uses NOW, and refuse to enforce a bound it already
 * exceeds. Safe by observation, the same rule that earned the R2 reaper its
 * --apply.
 *
 * A SECOND TRAP, checked here because it is silent and total: a ResourceQuota
 * that constrains `requests.cpu` makes declaring requests MANDATORY for every
 * pod in the namespace. A namespace containing one container without them
 * stops being able to create pods at all — including the replacement for a
 * pod that just crashed. Tenant Deployments do declare requests today; that
 * is a fact about the current manifest, not a guarantee, so it is verified
 * rather than assumed.
 *
 * Pure. No network, no cluster writes.
 */

/** Kubernetes quantity strings, kept as written so the manifest is readable. */
export interface QuotaPolicy {
  /** Ceiling on pods, which is what the LKE cluster cap actually counts. */
  pods: number;
  requestsCpu: string;
  requestsMemory: string;
  limitsCpu: string;
  limitsMemory: string;
  /** Per-container ceiling, so one container cannot take the whole namespace. */
  maxContainerCpu: string;
  maxContainerMemory: string;
  /** Applied to containers that declare nothing. Mirrors the app manifest. */
  defaultRequestCpu: string;
  defaultRequestMemory: string;
  defaultLimitCpu: string;
  defaultLimitMemory: string;
}

/**
 * The default budget, declared rather than inherited — same rule as the scan
 * policy. Every number has an argument, so changing one is a decision someone
 * signs.
 *
 * Anchored on the plan's own arithmetic: a 32GB/16vCPU node holds about 65
 * tenant pods after system overhead, which is roughly 500MB and a quarter
 * core per pod. `appDeployment` already requests 100m/256Mi and limits
 * 1/512Mi, so these bounds are set to allow a few replicas plus the surge of
 * a rolling deploy, and not much more.
 *
 * `pods` is the one that matters most. LKE caps pods per CLUSTER — the plan is
 * explicit that this cap, not CPU or RAM, is what forces a multi-cluster
 * fleet — so a pod ceiling per tenant is the bound that protects the thing
 * actually in short supply.
 */
export const DEFAULT_QUOTA: QuotaPolicy = {
  pods: 8,
  requestsCpu: "1",
  requestsMemory: "2Gi",
  limitsCpu: "8",
  limitsMemory: "4Gi",
  maxContainerCpu: "2",
  maxContainerMemory: "1Gi",
  defaultRequestCpu: "100m",
  defaultRequestMemory: "256Mi",
  defaultLimitCpu: "1",
  defaultLimitMemory: "512Mi",
};

// ── what a namespace currently uses ─────────────────────────────────────────

export interface ContainerSpecLike {
  name: string;
  resources?: {
    requests?: { cpu?: string; memory?: string };
    limits?: { cpu?: string; memory?: string };
  };
}

export interface PodSpecLike {
  name: string;
  phase?: string;
  containers: ContainerSpecLike[];
}

/**
 * Parse a Kubernetes CPU quantity to cores, or null when unreadable.
 *
 * Null is never treated as zero. A container whose request cannot be read is
 * the case that makes a quota unsafe to apply, and reading it as 0 would make
 * every namespace look comfortably under budget.
 */
export function cpuCores(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  const milli = /^(\d+(?:\.\d+)?)m$/.exec(s);
  if (milli) return Number(milli[1]) / 1000;
  const plain = /^(\d+(?:\.\d+)?)$/.exec(s);
  return plain ? Number(plain[1]) : null;
}

const MEM_UNITS: Record<string, number> = {
  "": 1,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/** Parse a memory quantity to bytes, or null when unreadable. */
export function memoryBytes(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T)?$/.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * MEM_UNITS[m[2] ?? ""];
}

export interface NamespaceUsage {
  pods: number;
  requestsCpu: number;
  requestsMemory: number;
  limitsCpu: number;
  limitsMemory: number;
  /** Containers that declare no requests. Each one makes a quota unsafe. */
  containersWithoutRequests: string[];
  /** Containers whose quantities could not be parsed. Also unsafe. */
  unreadable: string[];
}

/**
 * Sum what a namespace is currently asking for.
 *
 * Only pods that count against a quota: Succeeded and Failed pods are
 * terminal and Kubernetes does not charge them, so counting them would
 * inflate usage and block a quota that is genuinely fine.
 */
export function measureNamespace(pods: PodSpecLike[]): NamespaceUsage {
  const usage: NamespaceUsage = {
    pods: 0,
    requestsCpu: 0,
    requestsMemory: 0,
    limitsCpu: 0,
    limitsMemory: 0,
    containersWithoutRequests: [],
    unreadable: [],
  };

  for (const pod of pods) {
    if (pod.phase === "Succeeded" || pod.phase === "Failed") continue;
    usage.pods += 1;

    for (const c of pod.containers) {
      const req = c.resources?.requests;
      const lim = c.resources?.limits;
      const where = `${pod.name}/${c.name}`;

      if (!req || (req.cpu === undefined && req.memory === undefined)) {
        usage.containersWithoutRequests.push(where);
        continue;
      }

      const rc = cpuCores(req.cpu);
      const rm = memoryBytes(req.memory);
      const lc = cpuCores(lim?.cpu);
      const lm = memoryBytes(lim?.memory);

      if (rc === null || rm === null) usage.unreadable.push(where);
      usage.requestsCpu += rc ?? 0;
      usage.requestsMemory += rm ?? 0;
      usage.limitsCpu += lc ?? 0;
      usage.limitsMemory += lm ?? 0;
    }
  }

  return usage;
}

// ── is it safe to enforce? ──────────────────────────────────────────────────

export interface QuotaVerdict {
  /** Safe to apply: current usage fits, and every container declares requests. */
  safe: boolean;
  /** Each reason the quota would break this namespace. */
  blockers: string[];
  /** Headroom left under each bound, for a report. */
  headroom: { pods: number; requestsCpu: number; requestsMemory: number };
}

export function canEnforce(usage: NamespaceUsage, policy: QuotaPolicy = DEFAULT_QUOTA): QuotaVerdict {
  const blockers: string[] = [];

  // The silent-and-total one. A quota on requests.cpu makes requests mandatory
  // namespace-wide, so one container without them stops pod creation entirely
  // — including the replacement for a pod that just crashed.
  if (usage.containersWithoutRequests.length) {
    blockers.push(
      `${usage.containersWithoutRequests.length} container(s) declare no resource requests ` +
        `(${usage.containersWithoutRequests.slice(0, 3).join(", ")}). A quota on requests.cpu ` +
        `makes them mandatory, so this namespace would stop being able to create pods at all.`,
    );
  }

  if (usage.unreadable.length) {
    blockers.push(
      `${usage.unreadable.length} container(s) have unreadable quantities ` +
        `(${usage.unreadable.slice(0, 3).join(", ")}). Current usage cannot be computed, ` +
        `so whether the quota fits is unknown — and unknown is not "fits".`,
    );
  }

  const limits: Array<[string, number, number | null, string]> = [
    ["pods", usage.pods, policy.pods, String(policy.pods)],
    ["requests.cpu", usage.requestsCpu, cpuCores(policy.requestsCpu), policy.requestsCpu],
    ["requests.memory", usage.requestsMemory, memoryBytes(policy.requestsMemory), policy.requestsMemory],
    ["limits.cpu", usage.limitsCpu, cpuCores(policy.limitsCpu), policy.limitsCpu],
    ["limits.memory", usage.limitsMemory, memoryBytes(policy.limitsMemory), policy.limitsMemory],
  ];

  for (const [name, used, bound, written] of limits) {
    if (bound === null) {
      blockers.push(`the policy's ${name} value ${JSON.stringify(written)} is not a valid quantity`);
      continue;
    }
    if (used > bound) {
      blockers.push(
        `${name}: already using ${used} against a bound of ${written}. Kubernetes would ` +
          `accept this quota and then reject the next deploy or restart — a delayed outage ` +
          `landing on whoever pushes next.`,
      );
    }
  }

  const cpuBound = cpuCores(policy.requestsCpu) ?? 0;
  const memBound = memoryBytes(policy.requestsMemory) ?? 0;

  return {
    safe: blockers.length === 0,
    blockers,
    headroom: {
      pods: policy.pods - usage.pods,
      requestsCpu: cpuBound - usage.requestsCpu,
      requestsMemory: memBound - usage.requestsMemory,
    },
  };
}

// ── the objects ─────────────────────────────────────────────────────────────

const ownerLabels = { "ahura.cloud/owner": "paas-v2", "ahura.cloud/component": "quota" };

export function resourceQuotaManifest(namespace: string, policy: QuotaPolicy = DEFAULT_QUOTA) {
  return {
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: { name: "tenant", namespace, labels: ownerLabels },
    spec: {
      hard: {
        pods: String(policy.pods),
        "requests.cpu": policy.requestsCpu,
        "requests.memory": policy.requestsMemory,
        "limits.cpu": policy.limitsCpu,
        "limits.memory": policy.limitsMemory,
      },
    },
  };
}

/**
 * Defaults AND a per-container ceiling.
 *
 * The defaults matter as much as the maxima: with them, a container that
 * declares nothing gets values rather than being rejected by the quota, which
 * removes the sharpest edge of enforcing one.
 */
export function limitRangeManifest(namespace: string, policy: QuotaPolicy = DEFAULT_QUOTA) {
  return {
    apiVersion: "v1",
    kind: "LimitRange",
    metadata: { name: "tenant", namespace, labels: ownerLabels },
    spec: {
      limits: [
        {
          type: "Container",
          max: { cpu: policy.maxContainerCpu, memory: policy.maxContainerMemory },
          defaultRequest: { cpu: policy.defaultRequestCpu, memory: policy.defaultRequestMemory },
          default: { cpu: policy.defaultLimitCpu, memory: policy.defaultLimitMemory },
        },
      ],
    },
  };
}
