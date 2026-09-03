/**
 * Settle the bill for a managed serving instance when it stops.
 *
 * Shared by the manual stop (DELETE serving-pod route) and the auto-stop
 * watchdog. Charges the org for actual uptime × the pod's hourly rate.
 *
 * Idempotency: the charge is tied to *winning* the atomic state transition
 * to "stopped". The UPDATE only matches a row whose state is still
 * provisioning/running, so whichever caller flips it first settles the bill;
 * a concurrent caller's UPDATE matches zero rows and skips charging. No
 * double charge is possible even if DELETE and the watchdog race.
 *
 * Billing is best-effort: a billing error is logged but never thrown, so a
 * stop request / watchdog sweep is never blocked by the billing layer.
 * Bills the org payer (billing_user_id), not whoever clicked stop.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { Billing } from "@/lib/supabase/queries/billing";

// Loose client type so the route's and watchdog's createClient(...) instances
// (typed SupabaseClient<any, "public", any>) assign cleanly and .schema()
// accepts the inference schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>;

export interface SettleServingPodResult {
  /** True if this call won the transition to stopped (and thus owns teardown). */
  settled: boolean;
  /** USD actually charged for this serving session (0 if none / on error). */
  chargedUsd: number;
  /** Upstream pod id of the row we settled, for the caller's teardown call. */
  servingPodId: string | null;
  outputModelId: string | null;
}

interface SettledRow {
  org_id: string;
  serving_pod_id: string | null;
  output_model_id: string | null;
  serving_pod_started_at: string | null;
  serving_pod_hourly_cents: number | null;
}

export async function settleServingPod(
  supabase: ServiceClient,
  ftId: string
): Promise<SettleServingPodResult> {
  const stoppedAtIso = new Date().toISOString();

  // Atomically flip active → stopped and read back what we need to bill.
  // Only rows still in an active state match, so this is the idempotency gate.
  const { data: row, error } = await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      serving_pod_state: "stopped",
      serving_pod_stopped_at: stoppedAtIso,
      serving_url: null,
      is_managed: false,
    })
    .eq("id", ftId)
    .in("serving_pod_state", ["provisioning", "running"])
    .select(
      "org_id, serving_pod_id, output_model_id, serving_pod_started_at, serving_pod_hourly_cents"
    )
    .maybeSingle<SettledRow>();

  if (error) {
    console.error(`[serving settle] state transition failed for ft ${ftId}:`, error.message);
    return { settled: false, chargedUsd: 0, servingPodId: null, outputModelId: null };
  }
  if (!row) {
    // Already stopped by a concurrent caller — nothing to settle.
    return { settled: false, chargedUsd: 0, servingPodId: null, outputModelId: null };
  }

  // Clear gateway routing so requests fall back off this pod.
  if (row.output_model_id) {
    await supabase
      .schema("inference")
      .from("models")
      .update({ serving_url: null, is_managed: false })
      .eq("id", row.output_model_id);
  }

  const result: SettleServingPodResult = {
    settled: true,
    chargedUsd: 0,
    servingPodId: row.serving_pod_id,
    outputModelId: row.output_model_id,
  };

  const hourlyCents = Number(row.serving_pod_hourly_cents) || 0;
  const startedAt = row.serving_pod_started_at ? new Date(row.serving_pod_started_at) : null;
  if (hourlyCents <= 0 || !startedAt || Number.isNaN(startedAt.getTime())) {
    return result; // nothing to charge (rate or start time unknown)
  }

  const uptimeSeconds = Math.max(0, (Date.parse(stoppedAtIso) - startedAt.getTime()) / 1000);
  const cents = Math.ceil((hourlyCents * uptimeSeconds) / 3600);
  if (cents <= 0) return result;

  const usd = cents / 100;
  try {
    const { data: orgRow } = await supabase
      .schema("inference")
      .from("orgs")
      .select("billing_user_id, owner_user_id")
      .eq("id", row.org_id)
      .maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
    const payer = orgRow?.billing_user_id || orgRow?.owner_user_id;
    if (!payer) {
      console.error(`[serving settle] no payer for org ${row.org_id}, ft ${ftId} — $${usd.toFixed(2)} not charged`);
      return result;
    }
    // One transaction: the deduct and the usage row commit together. The outer
    // catch below logs and continues, so previously a failed row left the org
    // charged for serving time with no record of the period it covered.
    await Billing.move_credit({
      userId: payer,
      amount: usd,
      direction: "debit",
      type: "usage",
      serviceId: ftId,
      serviceType: "inference_serving",
      periodStart: startedAt.toISOString(),
      periodEnd: stoppedAtIso,
      description: "Managed serving instance",
      metadata: { hours: Number((uptimeSeconds / 3600).toFixed(4)) },
    });
    result.chargedUsd = usd;
  } catch (e) {
    console.error(
      `[serving settle] charge failed for ft ${ftId} ($${usd.toFixed(2)}):`,
      e instanceof Error ? e.message : e
    );
  }
  return result;
}
