import { createServiceClient } from "@/lib/supabase/server";
import { monthBounds, dateOnly } from "./utils";
import type { BandwidthLifecycleStatus, BandwidthUsageRow, PodCounterRow } from "./types";

// ── Monthly usage table ───────────────────────────────────────────────────────

export async function loadCurrentUsage(appId: string): Promise<BandwidthUsageRow | null> {
  const { start } = monthBounds();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_app_bandwidth_usage_monthly")
    .select("id, app_id, user_id, period_start, period_end, ingress_bytes, egress_bytes, total_bytes, purchased_bytes, lifecycle_status, source, last_sampled_at, restricted_at, restored_at, metadata, created_at, updated_at")
    .eq("app_id", appId)
    .eq("period_start", dateOnly(start))
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch app bandwidth usage: ${error.message}`);
  return data ?? null;
}

export type UpsertUsagePayload = {
  app_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  ingress_bytes: number;
  egress_bytes: number;
  lifecycle_status: BandwidthLifecycleStatus;
  source: string;
  last_sampled_at: string;
  restricted_at: string | null;
  restored_at: string | null;
  metadata: Record<string, unknown>;
};

export async function upsertUsage(payload: UpsertUsagePayload): Promise<BandwidthUsageRow> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_app_bandwidth_usage_monthly")
    .upsert(payload, { onConflict: "app_id,period_start" })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to upsert app bandwidth usage: ${error.message}`);
  return data as BandwidthUsageRow;
}

export async function updateUsageLifecycleAndMetadata(
  appId: string,
  periodStart: string,
  updates: {
    lifecycle_status?: BandwidthLifecycleStatus;
    restricted_at?: string | null;
    restored_at?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<BandwidthUsageRow> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_app_bandwidth_usage_monthly")
    .update(updates)
    .eq("app_id", appId)
    .eq("period_start", periodStart)
    .select("id, app_id, user_id, period_start, period_end, ingress_bytes, egress_bytes, total_bytes, purchased_bytes, lifecycle_status, source, last_sampled_at, restricted_at, restored_at, metadata, created_at, updated_at")
    .single();

  if (error) throw new Error(`Failed to update app bandwidth usage metadata: ${error.message}`);
  return data as BandwidthUsageRow;
}

// ── Pod counter table ─────────────────────────────────────────────────────────

/**
 * Load the last-known Prometheus counter values for each pod belonging to an app.
 *
 * Pod counters are absolute cumulative bytes since pod start and must be kept
 * across month boundaries. The correct delta is always:
 *   current_counter − saved_counter
 * regardless of when saved_counter was recorded. Discarding counters at month
 * start would make the first sync of the new month count the pod's entire
 * lifetime traffic as this month's usage — the opposite of what we want.
 *
 * Month-boundary correctness is guaranteed by the monthly usage table: each
 * billing period has its own row (unique on app_id, period_start), so totals
 * always start at zero for a new month and deltas accumulate from there.
 */
export async function loadPodCounters(appId: string): Promise<Map<string, PodCounterRow>> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_app_bandwidth_pod_counters")
    .select("pod_name, receive_counter, transmit_counter, sampled_at")
    .eq("app_id", appId);

  if (error) throw new Error(`Failed to load pod counters: ${error.message}`);

  const map = new Map<string, PodCounterRow>();
  for (const row of data ?? []) {
    map.set(row.pod_name as string, row as PodCounterRow);
  }
  return map;
}

export async function savePodCounters(
  appId: string,
  pods: { pod: string; receiveBytes: number; transmitBytes: number }[],
  sampledAt: string
): Promise<void> {
  if (pods.length === 0) return;

  const supabase = await createServiceClient();
  const rows = pods.map((p) => ({
    app_id: appId,
    pod_name: p.pod,
    receive_counter: p.receiveBytes,
    transmit_counter: p.transmitBytes,
    sampled_at: sampledAt,
  }));

  const { error } = await supabase
    .from("platform_app_bandwidth_pod_counters")
    .upsert(rows, { onConflict: "app_id,pod_name" });

  if (error) throw new Error(`Failed to save pod counters: ${error.message}`);
}

/**
 * Atomically increment purchased_bytes for the current month's usage row.
 * Creates the row with zero usage if it doesn't exist yet (user bought a pack
 * before the first cron sync ran for their app).
 */
export async function addPurchasedBytes(
  appId: string,
  userId: string,
  bytesToAdd: number
): Promise<BandwidthUsageRow> {
  const { start, end } = monthBounds();
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .rpc("increment_platform_app_bandwidth_purchased_bytes", {
      p_app_id: appId,
      p_user_id: userId,
      p_period_start: dateOnly(start),
      p_period_end: dateOnly(end),
      p_bytes: bytesToAdd,
    });

  if (error) throw new Error(`Failed to add purchased bytes: ${error.message}`);
  return data as BandwidthUsageRow;
}

/**
 * Atomically claim overage bytes for billing. Sets the period's
 * overage_billed_bytes to p_target (under a row lock) and returns how many
 * NEW bytes this call claimed (target − previously-billed, clamped ≥ 0).
 * Concurrent callers can't claim the same bytes, so each byte is billed once.
 */
export async function claimOverageBytes(
  appId: string,
  periodStart: string,
  targetBilledBytes: number
): Promise<number> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc(
    "claim_platform_app_bandwidth_overage_bytes",
    { p_app_id: appId, p_period_start: periodStart, p_target_billed_bytes: targetBilledBytes }
  );
  if (error) throw new Error(`Failed to claim overage bytes: ${error.message}`);
  return Number(data) || 0;
}

/**
 * Release a previously-claimed overage byte amount (e.g. when the charge
 * failed) so it gets billed on a later run instead of being dropped.
 */
export async function releaseOverageBytes(
  appId: string,
  periodStart: string,
  bytes: number
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.rpc(
    "release_platform_app_bandwidth_overage_bytes",
    { p_app_id: appId, p_period_start: periodStart, p_bytes: bytes }
  );
  if (error) {
    console.warn(`[usage-store] Failed to release overage bytes for ${appId}:`, error.message);
  }
}

/**
 * Remove counter rows for pods that no longer exist in the current Prometheus sample.
 *
 * Pods are replaced on every deployment (new random suffix), so the counter table
 * accumulates stale rows indefinitely without pruning. Call this after each successful
 * `savePodCounters` with the same `activePodNames` list.
 */
export async function pruneStalePodCounters(
  appId: string,
  activePodNames: string[]
): Promise<void> {
  if (activePodNames.length === 0) return;

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("platform_app_bandwidth_pod_counters")
    .delete()
    .eq("app_id", appId)
    .not("pod_name", "in", `(${activePodNames.join(",")})`);

  if (error) {
    console.warn(`[usage-store] Failed to prune stale pod counters for ${appId}:`, error.message);
  }
}
