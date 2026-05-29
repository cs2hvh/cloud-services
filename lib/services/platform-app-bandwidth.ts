/**
 * Platform App Bandwidth Service
 *
 * Orchestrates per-app network metering, quota enforcement, and lifecycle
 * notifications for deployed platform applications.
 *
 * Sub-modules (all in ./platform-app-bandwidth/):
 *   types.ts          – shared types and interfaces
 *   constants.ts      – K8s annotation keys, quota defaults
 *   utils.ts          – pure calculation helpers (no I/O)
 *   quota.ts          – resolves BandwidthQuota from the Products table
 *   usage-store.ts    – Supabase reads/writes for usage + pod counters
 *   k8s-ingress.ts    – NGINX Ingress annotation enforcement
 *   k8s-discovery.ts  – Kubernetes Deployment scan + DB cross-reference
 *   notifications.ts  – lifecycle event emission + user notifications
 *   overage-billing.ts – usage billing when a plan allows overage
 */

import { PrometheusService } from "@/lib/services/prometheus";

import { resolveQuota } from "./platform-app-bandwidth/quota";
import {
  loadCurrentUsage,
  upsertUsage,
  addPurchasedBytes as _addPurchasedBytes,
  loadPodCounters,
  savePodCounters,
  pruneStalePodCounters,
} from "./platform-app-bandwidth/usage-store";
import {
  computeDeltas,
  calculateStatus,
  lifecycleFromStatus,
  toUsageSummary,
  monthBounds,
  dateOnly,
} from "./platform-app-bandwidth/utils";
import {
  applyBandwidthRestriction,
  removeBandwidthRestriction,
  syncRestrictionState,
  syncMaxRequestBodySize,
} from "./platform-app-bandwidth/k8s-ingress";
import {
  discoverAppNamesFromKubernetes,
  findAppsWithoutBandwidthRecord,
} from "./platform-app-bandwidth/k8s-discovery";
import { emitLifecycleEvents } from "./platform-app-bandwidth/notifications";
import { billOverageIfNeeded } from "./platform-app-bandwidth/overage-billing";
import type {
  BandwidthQuota,
  BandwidthUsageSummary,
  BandwidthUsageRow,
  RefreshUsageArgs,
} from "./platform-app-bandwidth/types";

// Re-export public types so callers only import from this module.
export type {
  BandwidthQuota,
  BandwidthStatus,
  BandwidthUsageSummary,
  BandwidthLifecycleStatus,
  RefreshUsageArgs,
} from "./platform-app-bandwidth/types";

// Re-export K8s enforcement functions for the sync route and deploy hooks.
export { applyBandwidthRestriction, removeBandwidthRestriction, syncRestrictionState, syncMaxRequestBodySize };

// Re-export usage-store helpers used by the purchase API.
export { _addPurchasedBytes as addPurchasedBytes };

// Re-export discovery functions for the sync route.
export { discoverAppNamesFromKubernetes, findAppsWithoutBandwidthRecord };

// ── Service class ─────────────────────────────────────────────────────────────

function createEmptyUsageRow(
  args: { appId: string; userId: string },
  period: { start: Date; end: Date }
): BandwidthUsageRow {
  const now = new Date().toISOString();
  return {
    id: "",
    app_id: args.appId,
    user_id: args.userId,
    period_start: dateOnly(period.start),
    period_end: dateOnly(period.end),
    ingress_bytes: 0,
    egress_bytes: 0,
    total_bytes: 0,
    purchased_bytes: 0,
    lifecycle_status: "ok",
    source: "prometheus",
    last_sampled_at: null,
    restricted_at: null,
    restored_at: null,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

function quotaWithPurchasedBytes(quota: BandwidthQuota, purchasedBytes: number): BandwidthQuota {
  return {
    ...quota,
    totalBytes: quota.totalBytes === null ? null : quota.totalBytes + purchasedBytes,
  };
}

export class PlatformAppBandwidthService {
  static getQuotaForSize = resolveQuota;

  static async getCurrentUsage(appId: string) {
    return loadCurrentUsage(appId);
  }

  static summarizeStoredUsage(
    row: BandwidthUsageRow | null,
    quota: BandwidthQuota,
    args: { appId: string; userId: string }
  ): BandwidthUsageSummary {
    if (row) return toUsageSummary(row, quota);

    return toUsageSummary(createEmptyUsageRow(args, monthBounds()), quota);
  }

  /**
   * Refresh the current month's bandwidth usage for one app.
   *
   * Steps:
   *  1. Read Prometheus absolute counters + saved counter state + existing monthly row + quota (parallel).
   *  2. Compute deltas since last sample (handles pod restarts and month boundaries).
   *  3. Accumulate deltas into the monthly total (never overwrites; only adds).
   *  4. Persist updated monthly row + new counter state.
   *  5. Emit lifecycle events and user notifications.
   */
  static async refreshCurrentUsage(args: RefreshUsageArgs): Promise<BandwidthUsageSummary> {
    const sampledAt = new Date().toISOString();
    const { start, end } = monthBounds();

    const [currentCounters, savedCounters, previous, quota] = await Promise.all([
      PrometheusService.getAppNetworkCounters(args.appName).catch(() => []),
      loadPodCounters(args.appId),
      loadCurrentUsage(args.appId),
      resolveQuota(args.size),
    ]);

    const { deltaIngress, deltaEgress } = computeDeltas(currentCounters, savedCounters);

    const newIngressBytes = Math.max((Number(previous?.ingress_bytes) || 0) + deltaIngress, 0);
    const newEgressBytes = Math.max((Number(previous?.egress_bytes) || 0) + deltaEgress, 0);
    const newTotalBytes = newIngressBytes + newEgressBytes;

    // Effective quota = plan quota + any bandwidth packs purchased this period.
    const effectiveQuota = quotaWithPurchasedBytes(quota, Number(previous?.purchased_bytes) || 0);
    const usage = calculateStatus(newTotalBytes, effectiveQuota.totalBytes);
    const lifecycle = lifecycleFromStatus(usage.status, effectiveQuota, usage.percentUsed, newTotalBytes);

    let savedRow = await upsertUsage({
      app_id: args.appId,
      user_id: args.userId,
      period_start: dateOnly(start),
      period_end: dateOnly(end),
      ingress_bytes: newIngressBytes,
      egress_bytes: newEgressBytes,
      lifecycle_status: lifecycle.lifecycleStatus,
      source: "prometheus",
      last_sampled_at: sampledAt,
      restricted_at:
        lifecycle.lifecycleStatus === "restricted"
          ? (previous?.restricted_at ?? sampledAt)
          : null,
      restored_at:
        previous && previous.lifecycle_status !== "ok" && lifecycle.lifecycleStatus === "ok"
          ? sampledAt
          : (previous?.restored_at ?? null),
      metadata: {
        ...(previous?.metadata ?? {}),
        pod_count: currentCounters.length,
        app_name: args.appName,
        quota_source: quota.source,
        delta_ingress: deltaIngress,
        delta_egress: deltaEgress,
      },
    });

    if (lifecycle.policyAction === "charge_overage") {
      savedRow = await billOverageIfNeeded(savedRow, quota, args.appName);
    }

    if (currentCounters.length > 0) {
      const activePodNames = currentCounters.map((p) => p.pod);
      savePodCounters(args.appId, currentCounters, sampledAt)
        .then(() => pruneStalePodCounters(args.appId, activePodNames))
        .catch((err) =>
          console.warn("[PlatformAppBandwidthService] Failed to save pod counters:", err?.message)
        );
    }

    const summary = toUsageSummary(savedRow, quota);

    await emitLifecycleEvents({
      appId: args.appId,
      appName: args.appName,
      userId: args.userId,
      periodStart: dateOnly(start),
      previousStatus: previous?.lifecycle_status ?? "ok",
      summary,
    });

    return summary;
  }

  // Expose K8s enforcement and discovery as service methods for callers that
  // prefer the class API over the standalone functions.
  static syncRestrictionState = syncRestrictionState;
  static discoverAppNamesFromKubernetes = discoverAppNamesFromKubernetes;
  static findAppsWithoutBandwidthRecord = findAppsWithoutBandwidthRecord;
}
