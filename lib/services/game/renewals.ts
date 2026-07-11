// Prepaid-monthly renewal sweep — invoked by the internal cron route.
//
// State machine per server:
//   active + auto_renew, expiring ≤24h  → charge → extend +30d (email receipt)
//   active, past expiry, unpaid/off     → suspend + 3-day grace (email warning)
//   suspended + auto_renew, funds later → charge → unsuspend + extend (self-heal)
//   suspended, grace elapsed            → delete + terminated (email)
//
// Charges are one-time deducts with 'recurring' ledger rows; every failure
// path is durable (status/grace columns) so re-runs converge.

import { createServiceClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";
import { resolveUserEmail } from "@/lib/services/shared/service-alert-email";
import { sendServiceEventEmail } from "@/lib/services/shared/service-event-email";
import {
  deleteGameServer,
  suspendGameServer,
  unsuspendGameServer,
  type GameServerRow,
} from "@/lib/services/game/lifecycle";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface RenewalSweepSummary {
  scanned: number;
  renewed: number;
  suspended: number;
  recovered: number;
  deleted: number;
  errors: number;
}

interface SweepRow extends GameServerRow {
  billing_service_id: string;
}

async function chargeRenewal(row: SweepRow): Promise<boolean> {
  const price = Number(row.monthly_price ?? 0);
  if (!(price > 0)) return true; // free/legacy rows never block on billing
  try {
    await Billing.deduct(row.user_id!, price);
  } catch {
    return false;
  }
  Billing.save_transaction({
    userId: row.user_id!,
    amount: price,
    status: "completed",
    type: "recurring",
    serviceId: row.billing_service_id,
    serviceType: "game_server",
    description: `Game server renewal: ${row.name} (1 month)`,
    metadata: { server_id: row.id, plan_slug: row.plan_slug },
  }).catch((e) => console.warn("[game-renewals] renewal transaction failed:", e?.message ?? e));
  return true;
}

async function extend(row: SweepRow): Promise<string> {
  const supabase = await createServiceClient();
  const base = row.ends_at ? Math.max(new Date(row.ends_at).getTime(), Date.now()) : Date.now();
  const newEnd = new Date(base + MONTH_MS).toISOString();
  await supabase
    .from("game_servers")
    .update({ ends_at: newEnd, grace_until: null, suspended_at: null })
    .eq("id", row.id);
  return newEnd;
}

export async function runRenewalSweep(): Promise<RenewalSweepSummary> {
  const supabase = await createServiceClient();
  const summary: RenewalSweepSummary = { scanned: 0, renewed: 0, suspended: 0, recovered: 0, deleted: 0, errors: 0 };

  const horizon = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("game_servers")
    .select(
      "id, name, game_type, status, user_id, identifier, ptero_server_id, ip, port, plan_slug, region, host_id, monthly_price, auto_renew, ends_at, grace_until, suspended_at, details, billing_service_id",
    )
    .in("status", ["active", "suspended"])
    .lte("ends_at", horizon);
  if (error) throw new Error(`Renewal sweep query failed: ${error.message}`);

  for (const row of (data ?? []) as SweepRow[]) {
    summary.scanned++;
    try {
      if (!row.user_id || !row.ends_at) continue;
      const email = await resolveUserEmail(row.user_id);
      const expired = new Date(row.ends_at).getTime() <= Date.now();

      if (row.status === "active") {
        if (row.auto_renew && (await chargeRenewal(row))) {
          const newEnd = await extend(row);
          summary.renewed++;
          await sendServiceEventEmail({
            userEmail: email,
            serviceType: "Game Server",
            serviceName: row.name,
            event: "renewed",
            items: [
              { label: "Amount", value: `$${Number(row.monthly_price ?? 0).toFixed(2)}` },
              { label: "Paid until", value: new Date(newEnd).toUTCString() },
            ],
            actionPath: `/dashboard/services/game/${row.id}`,
          });
        } else if (expired) {
          const graceUntil = new Date(Date.now() + GRACE_MS).toISOString();
          await suspendGameServer(row, row.auto_renew ? "Renewal payment failed — insufficient balance" : "Auto-renew is off and the period ended", graceUntil);
          summary.suspended++;
          await sendServiceEventEmail({
            userEmail: email,
            serviceType: "Game Server",
            serviceName: row.name,
            event: "suspended",
            summary: row.auto_renew
              ? "We couldn't renew your server — top up your balance to resume it."
              : "Your prepaid period ended with auto-renew off.",
            items: [{ label: "Deleted after", value: new Date(graceUntil).toUTCString() }],
            actionPath: `/dashboard/services/game/${row.id}`,
            actionLabel: "Resume server",
          });
        }
        // not expired + charge failed → retried on every sweep until expiry
        continue;
      }

      // status === "suspended"
      if (row.auto_renew && (await chargeRenewal(row))) {
        await extend(row);
        await unsuspendGameServer(row);
        summary.recovered++;
        await sendServiceEventEmail({
          userEmail: email,
          serviceType: "Game Server",
          serviceName: row.name,
          event: "resumed",
          summary: "Payment received — your server is back online.",
          actionPath: `/dashboard/services/game/${row.id}`,
        });
        continue;
      }
      if (row.grace_until && new Date(row.grace_until).getTime() <= Date.now()) {
        await deleteGameServer({
          server: row,
          reason: "Grace period ended without payment — server deleted",
          notifyEmail: email,
        });
        summary.deleted++;
      }
    } catch (e) {
      summary.errors++;
      console.error(`[game-renewals] sweep error for server ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return summary;
}
