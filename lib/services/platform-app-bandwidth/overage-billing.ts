import { Billing } from "@/lib/supabase/queries/billing";
import { GB } from "./constants";
import {
  claimOverageBytes,
  loadCurrentUsage,
  releaseOverageBytes,
  updateUsageLifecycleAndMetadata,
} from "./usage-store";
import type { BandwidthQuota, BandwidthUsageRow } from "./types";

function roundedUsd(amount: number): number {
  return Math.round(amount * 10_000) / 10_000;
}

function overageBytesFor(row: BandwidthUsageRow, quota: BandwidthQuota): number {
  if (quota.totalBytes === null) return 0;
  const includedBytes = quota.totalBytes + (Number(row.purchased_bytes) || 0);
  return Math.max((Number(row.total_bytes) || 0) - includedBytes, 0);
}

/**
 * Charge only newly-accrued overage bytes for overage-enabled plans.
 *
 * Concurrency- and failure-safe: the unbilled bytes are CLAIMED atomically
 * (claim_…_overage_bytes, row-locked) before we charge, so overlapping cron
 * runs can never bill the same bytes twice. If the deduct fails we RELEASE the
 * claim so the bytes are retried next run (never dropped, never double-billed),
 * and move the app to `restricted` so K8s enforcement blocks public traffic.
 *
 * `overage_billed_bytes` is owned exclusively by the claim/release RPCs — the
 * app layer never writes it directly (a whole-row metadata write would clobber
 * the atomic value), which is why the success path re-reads fresh metadata
 * before recording the informational fields.
 */
export async function billOverageIfNeeded(
  row: BandwidthUsageRow,
  quota: BandwidthQuota,
  appName: string
): Promise<BandwidthUsageRow> {
  if (quota.overagePerGb === null || quota.totalBytes === null) return row;

  const targetOverageBytes = overageBytesFor(row, quota);
  const alreadyBilledBytes = Number((row.metadata ?? {}).overage_billed_bytes) || 0;

  // Cheap pre-check on the (possibly stale) row to skip clearly sub-cent work
  // before taking the row lock. The claim below is the real source of truth.
  const pendingBytes = Math.max(targetOverageBytes - alreadyBilledBytes, 0);
  if (pendingBytes <= 0 || roundedUsd((pendingBytes / GB) * quota.overagePerGb) < 0.01) {
    return row;
  }

  // Atomically claim the unbilled overage. `claimedBytes` is the amount THIS
  // call is responsible for — a concurrent run that already claimed gets 0.
  const claimedBytes = await claimOverageBytes(row.app_id, row.period_start, targetOverageBytes);
  if (claimedBytes <= 0) return row;

  const charge = roundedUsd((claimedBytes / GB) * quota.overagePerGb);
  if (charge < 0.01) {
    // Sub-cent after the real claim — release so it accumulates and bills later.
    await releaseOverageBytes(row.app_id, row.period_start, claimedBytes);
    return row;
  }

  try {
    const balanceAfter = await Billing.deduct(row.user_id, charge);
    await Billing.save_transaction({
      userId: row.user_id,
      amount: charge,
      status: "completed",
      type: "usage",
      balanceAfter,
      description: `Platform app bandwidth overage for ${appName}`,
      serviceId: row.app_id,
      serviceType: "platform_apps",
      periodStart: row.period_start,
      periodEnd: row.period_end,
      metadata: {
        app_id: row.app_id,
        app_name: appName,
        overage_bytes: claimedBytes,
        overage_rate_per_gb: quota.overagePerGb,
      },
    }).catch((error) => {
      console.warn(`[platform-app-bandwidth] Failed to record overage transaction:`, error);
    });

    // Re-read so we merge onto the post-claim metadata (which holds the
    // authoritative overage_billed_bytes) instead of clobbering it.
    const fresh = (await loadCurrentUsage(row.app_id)) ?? row;
    return updateUsageLifecycleAndMetadata(row.app_id, row.period_start, {
      metadata: {
        ...(fresh.metadata ?? {}),
        overage_charged_usd: roundedUsd((Number((fresh.metadata ?? {}).overage_charged_usd) || 0) + charge),
        overage_last_charged_at: new Date().toISOString(),
        overage_last_charge_usd: charge,
        overage_billing_error: null,
        restriction_reason: null,
      },
    });
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[platform-app-bandwidth] Overage charge failed for ${appName}:`, message);

    // Roll the claim back so these bytes are retried (not lost), then restrict.
    await releaseOverageBytes(row.app_id, row.period_start, claimedBytes);
    const fresh = (await loadCurrentUsage(row.app_id)) ?? row;
    return updateUsageLifecycleAndMetadata(row.app_id, row.period_start, {
      lifecycle_status: "restricted",
      restricted_at: row.restricted_at ?? now,
      metadata: {
        ...(fresh.metadata ?? {}),
        overage_unbilled_bytes: claimedBytes,
        overage_billing_error: message,
        overage_billing_failed_at: now,
        restriction_reason: "overage_billing_failed",
      },
    });
  }
}
