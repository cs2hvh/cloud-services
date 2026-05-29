import { Billing } from "@/lib/supabase/queries/billing";
import { GB } from "./constants";
import { updateUsageLifecycleAndMetadata } from "./usage-store";
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
 * Charge only newly accrued overage bytes for overage-enabled plans.
 *
 * If the charge fails, the app is moved to `restricted` with a stable metadata
 * reason so the normal K8s enforcement path blocks public traffic.
 */
export async function billOverageIfNeeded(
  row: BandwidthUsageRow,
  quota: BandwidthQuota,
  appName: string
): Promise<BandwidthUsageRow> {
  if (quota.overagePerGb === null || quota.totalBytes === null) return row;

  const metadata = row.metadata ?? {};
  const alreadyBilledBytes = Number(metadata.overage_billed_bytes) || 0;
  const unbilledBytes = Math.max(overageBytesFor(row, quota) - alreadyBilledBytes, 0);
  if (unbilledBytes <= 0) return row;

  const charge = roundedUsd((unbilledBytes / GB) * quota.overagePerGb);
  if (charge < 0.01) return row;

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
        overage_bytes: unbilledBytes,
        overage_rate_per_gb: quota.overagePerGb,
      },
    }).catch((error) => {
      console.warn(`[platform-app-bandwidth] Failed to record overage transaction:`, error);
    });

    return updateUsageLifecycleAndMetadata(row.app_id, row.period_start, {
      metadata: {
        ...metadata,
        overage_billed_bytes: alreadyBilledBytes + unbilledBytes,
        overage_charged_usd: roundedUsd((Number(metadata.overage_charged_usd) || 0) + charge),
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

    return updateUsageLifecycleAndMetadata(row.app_id, row.period_start, {
      lifecycle_status: "restricted",
      restricted_at: row.restricted_at ?? now,
      metadata: {
        ...metadata,
        overage_unbilled_bytes: unbilledBytes,
        overage_billing_error: message,
        overage_billing_failed_at: now,
        restriction_reason: "overage_billing_failed",
      },
    });
  }
}
