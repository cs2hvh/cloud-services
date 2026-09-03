/**
 * Meter + charge a BYO model deployment for GPU worker uptime.
 *
 * BYO deployments run on RunPod Serverless and bill us per worker-second — both
 * always-on (min_workers) and execution. The deployment-meter cron samples each
 * endpoint's live worker count every few minutes and calls this to charge the
 * interval since the last sample:
 *
 *     cost = workersUp × perWorkerHourlyCents × (now − last_metered_at)
 *
 * Safety:
 *  - First sample (last_metered_at null) just seeds the clock — charges nothing.
 *  - workersUp ≤ 0 (scaled to zero) advances the clock without charging.
 *  - The interval is capped so a stalled cron can't emit one giant catch-up bill.
 *  - We advance last_metered_at on EVERY path (even on a charge error) so a
 *    transient failure can never double-bill the same interval next tick.
 *  - Billing is best-effort: errors are logged, never thrown.
 *
 * Bills the org payer (billing_user_id), not whoever created the deployment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { Billing } from "@/lib/supabase/queries/billing";

// Loose client type so the route's createClient(...) instance assigns cleanly
// and .schema() accepts the inference schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>;

export interface DeploymentMeterRow {
  id: string;
  org_id: string;
  name: string;
  last_metered_at: string | null;
}

export interface MeterResult {
  chargedUsd: number;
  hours: number;
}

export async function meterDeployment(
  supabase: ServiceClient,
  row: DeploymentMeterRow,
  workersUp: number,
  perWorkerHourlyCents: number,
  nowMs: number,
  maxIntervalSeconds: number
): Promise<MeterResult> {
  const nowIso = new Date(nowMs).toISOString();
  const result: MeterResult = { chargedUsd: 0, hours: 0 };

  const advance = async () => {
    await supabase
      .schema("inference")
      .from("deployments")
      .update({ last_metered_at: nowIso })
      .eq("id", row.id);
  };

  const lastMs = row.last_metered_at ? Date.parse(row.last_metered_at) : NaN;
  const seeded = Number.isFinite(lastMs);

  // Nothing billable: first sample, scaled to zero, or unknown rate.
  if (!seeded || workersUp <= 0 || perWorkerHourlyCents <= 0) {
    await advance();
    return result;
  }

  let intervalSec = Math.max(0, (nowMs - lastMs) / 1000);
  if (intervalSec <= 0) {
    await advance();
    return result;
  }
  intervalSec = Math.min(intervalSec, maxIntervalSeconds);

  const cents = Math.ceil((perWorkerHourlyCents * workersUp * intervalSec) / 3600);
  if (cents <= 0) {
    await advance();
    return result;
  }

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
      console.error(
        `[deploy meter] no payer for org ${row.org_id}, deployment ${row.id} — $${usd.toFixed(2)} not charged`
      );
    } else {
      // Charge and record commit together. The outer catch logs and moves on,
      // so a failed row here previously left the org billed for GPU time with
      // no record of the interval it covered — and the meter had already moved
      // past it.
      await Billing.move_credit({
        userId: payer,
        amount: usd,
        direction: "debit",
        type: "usage",
        serviceId: row.id,
        serviceType: "inference_deployment",
        periodStart: new Date(lastMs).toISOString(),
        periodEnd: nowIso,
        description: "Model deployment GPU",
        metadata: { workers: workersUp, hours: Number((intervalSec / 3600).toFixed(4)) },
      });
      result.chargedUsd = usd;
      result.hours = intervalSec / 3600;
    }
  } catch (e) {
    console.error(
      `[deploy meter] charge failed for deployment ${row.id} ($${usd.toFixed(2)}):`,
      e instanceof Error ? e.message : e
    );
  }

  // Advance regardless — a charge failure must not re-bill this interval.
  await advance();
  return result;
}
