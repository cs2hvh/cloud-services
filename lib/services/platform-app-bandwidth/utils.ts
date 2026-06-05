import { RESTRICTION_GRACE_PERCENT } from "./constants";
import type {
  BandwidthLifecycleStatus,
  BandwidthPolicyAction,
  BandwidthQuota,
  BandwidthStatus,
  BandwidthUsageRow,
  BandwidthUsageSummary,
  PlatformAppSize,
  PodCounterRow,
} from "./types";

// ── Unit conversions ──────────────────────────────────────────────────────────

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function gbToBytes(value: unknown): number | null {
  const gb = toFiniteNumber(value);
  if (gb === null || gb < 0) return null;
  return Math.round(gb * 1024 ** 3);
}

export function mbToBytes(value: unknown): number | null {
  const mb = toFiniteNumber(value);
  if (mb === null || mb < 0) return null;
  return Math.round(mb * 1024 * 1024);
}

export function bytesToDisplay(bytes: number | null): string {
  if (bytes === null) return "unlimited";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit <= 1 ? 0 : 1)} ${units[unit]}`;
}

// ── Structured resource lookup ────────────────────────────────────────────────

export function getResourceValue(resources: unknown, keys: string[]): unknown {
  if (!resources || typeof resources !== "object") return undefined;
  const record = resources as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function monthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function normalizeSize(size?: string | null): PlatformAppSize {
  if (size === "custom") return "xxlarge";
  if (size === "medium" || size === "large" || size === "xlarge" || size === "xxlarge") {
    return size;
  }
  return "small";
}

// ── Quota/usage calculations ──────────────────────────────────────────────────

export function calculateStatus(
  totalBytes: number,
  quotaBytes: number | null
): {
  percentUsed: number | null;
  status: BandwidthStatus;
  remainingBytes: number | null;
} {
  if (!quotaBytes || quotaBytes <= 0) {
    return { percentUsed: null, status: "unlimited", remainingBytes: null };
  }
  const percentUsed = Math.round((totalBytes / quotaBytes) * 10_000) / 100;
  const remainingBytes = Math.max(quotaBytes - totalBytes, 0);
  if (percentUsed >= 100) return { percentUsed, status: "exceeded", remainingBytes };
  if (percentUsed >= 90) return { percentUsed, status: "critical", remainingBytes };
  if (percentUsed >= 80) return { percentUsed, status: "warning", remainingBytes };
  return { percentUsed, status: "ok", remainingBytes };
}

export function lifecycleFromStatus(
  status: BandwidthStatus,
  quota: BandwidthQuota,
  percentUsed?: number | null,
  totalBytes?: number
): { lifecycleStatus: BandwidthLifecycleStatus; policyAction: BandwidthPolicyAction } {
  if (status === "exceeded") {
    if (quota.overagePerGb !== null) {
      // Hard-stop when the overage cap is breached even though billing is enabled.
      const overCapExceeded =
        quota.overageLimitBytes !== null &&
        totalBytes !== undefined &&
        quota.totalBytes !== null &&
        totalBytes > quota.totalBytes + quota.overageLimitBytes;
      return overCapExceeded
        ? { lifecycleStatus: "restricted", policyAction: "restrict" }
        : { lifecycleStatus: "overage", policyAction: "charge_overage" };
    }
    // No overage plan: allow a small grace window before hard-blocking traffic.
    // This prevents instant restriction on the first sync that tips just over 100%.
    const pct = percentUsed ?? 100;
    return pct < RESTRICTION_GRACE_PERCENT
      ? { lifecycleStatus: "critical", policyAction: "notify" }
      : { lifecycleStatus: "restricted", policyAction: "restrict" };
  }
  if (status === "critical") return { lifecycleStatus: "critical", policyAction: "notify" };
  if (status === "warning") return { lifecycleStatus: "warning", policyAction: "notify" };
  return { lifecycleStatus: "ok", policyAction: "allow" };
}

export function toUsageSummary(
  row: BandwidthUsageRow,
  quota: BandwidthQuota,
  restrictionEnforced = false
): BandwidthUsageSummary {
  const totalBytes = Number(row.total_bytes);
  const purchasedBytes = Number(row.purchased_bytes) || 0;

  // Effective quota includes any bandwidth packs the user has purchased.
  const effectiveQuotaBytes = quota.totalBytes !== null
    ? quota.totalBytes + purchasedBytes
    : quota.totalBytes;
  const effectiveQuota: BandwidthQuota = { ...quota, totalBytes: effectiveQuotaBytes };

  const usage = calculateStatus(totalBytes, effectiveQuotaBytes);
  const forcedRestrictionReason =
    typeof row.metadata?.restriction_reason === "string"
      ? row.metadata.restriction_reason
      : null;
  const policy =
    row.lifecycle_status === "restricted" && forcedRestrictionReason
      ? { lifecycleStatus: "restricted" as const, policyAction: "restrict" as const }
      : lifecycleFromStatus(usage.status, effectiveQuota, usage.percentUsed, totalBytes);

  return {
    appId: row.app_id,
    userId: row.user_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    ingressBytes: Number(row.ingress_bytes),
    egressBytes: Number(row.egress_bytes),
    totalBytes,
    purchasedBytes,
    quota: effectiveQuota,
    percentUsed: usage.percentUsed,
    status: usage.status,
    remainingBytes: usage.remainingBytes,
    shouldBlockNewTraffic: policy.policyAction === "restrict",
    lifecycleStatus: policy.lifecycleStatus,
    policyAction: policy.policyAction,
    lastSampledAt: row.last_sampled_at,
    restrictionEnforced,
  };
}

// ── Delta computation ─────────────────────────────────────────────────────────

export function computeDeltas(
  currentPods: { pod: string; receiveBytes: number; transmitBytes: number }[],
  savedCounters: Map<string, PodCounterRow>
): { deltaIngress: number; deltaEgress: number } {
  let deltaIngress = 0;
  let deltaEgress = 0;

  for (const pod of currentPods) {
    const saved = savedCounters.get(pod.pod);

    // First time we've seen this pod: seed only, contribute no delta. We can't
    // attribute its pre-existing counter to the current period — it may include
    // traffic from before tracking began (the first sync after rollout, or a pod
    // that started in a prior month) — and counting the full value would
    // massively over-count and over-bill. The caller's savePodCounters records
    // this pod's baseline, so the next sync measures a real delta from here.
    if (!saved) continue;

    const lastReceive = saved.receive_counter;
    const lastTransmit = saved.transmit_counter;

    // Counter reset detection: if current < last the pod restarted.
    // Treat the full current value as this sync's delta (bytes accumulated since restart).
    deltaIngress += pod.receiveBytes >= lastReceive
      ? pod.receiveBytes - lastReceive
      : pod.receiveBytes;
    deltaEgress += pod.transmitBytes >= lastTransmit
      ? pod.transmitBytes - lastTransmit
      : pod.transmitBytes;
  }

  return { deltaIngress, deltaEgress };
}
