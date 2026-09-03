/**
 * Charge an org's billing account for a finished fine-tune.
 *
 * Shared by the completion webhook and the training-pod reaper so both bill
 * through one path. Callers MUST gate this on winning the atomic terminal
 * status transition (so it runs at most once per job) — see the webhook and
 * the finetune-watchdog. Deducts atomically and records a usage ledger entry
 * that shows in the customer's billing history. Bills the org payer
 * (billing_user_id), not whoever launched.
 *
 * Best-effort: a billing error is logged but never thrown, so a webhook or a
 * reaper sweep is never blocked by the billing layer. Worst case is an
 * undercharge, never a double charge (the caller's transition gate guarantees
 * single execution).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { Billing } from "@/lib/supabase/queries/billing";

// Loose client type so the routes' createClient(...) instances assign cleanly
// and .schema() accepts the inference schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = SupabaseClient<any, any, any>;

export async function chargeFinetuneUsage(
  supabase: ServiceClient,
  orgId: string,
  jobId: string,
  jobName: string,
  costCents: number,
  elapsedSeconds: number
): Promise<void> {
  if (!costCents || costCents <= 0) return;
  const usd = costCents / 100;
  try {
    const { data: orgRow } = await supabase
      .schema("inference")
      .from("orgs")
      .select("billing_user_id, owner_user_id")
      .eq("id", orgId)
      .maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
    const payer = orgRow?.billing_user_id || orgRow?.owner_user_id;
    if (!payer) {
      console.error(`[FT charge] no payer for org ${orgId}, job ${jobId} — $${usd.toFixed(2)} not charged`);
      return;
    }
    const end = new Date();
    const start = new Date(end.getTime() - Math.max(0, elapsedSeconds) * 1000);
    // Charge and record in one transaction. A fine-tune bills a single lump
    // for hours already consumed, so a lost row here is a charge no one can
    // reconstruct — the job has finished and the elapsed time is gone.
    await Billing.move_credit({
      userId: payer,
      amount: usd,
      direction: "debit",
      type: "usage",
      serviceId: jobId,
      serviceType: "inference_finetune",
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      description: `Fine-tuning: ${jobName}`,
      metadata: { hours: Number((Math.max(0, elapsedSeconds) / 3600).toFixed(4)) },
    });
  } catch (e) {
    console.error(
      `[FT charge] failed to bill org ${orgId} job ${jobId} ($${usd.toFixed(2)}):`,
      e instanceof Error ? e.message : e
    );
  }
}
