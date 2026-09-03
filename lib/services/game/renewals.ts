// Prepaid-monthly renewal sweep — invoked by the internal cron route.
//
// State machine per server:
//   active + auto_renew, expiring ≤24h  → charge → extend +30d (email receipt)
//   active, past expiry, unpaid/off     → suspend + 3-day grace (email warning)
//   suspended + auto_renew, funds later → charge → unsuspend + extend (self-heal)
//   suspended, grace elapsed            → delete + terminated (email)
//   any, monthly_price missing or ≤ 0   → error, row untouched (no free renewals)
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
  /**
   * Past-expiry rows the sweep does not act on because their status is
   * neither active nor suspended (mid-provision, failed, legacy). Counted so
   * they are visible, not swept. Null when the count itself could not be
   * read — an unreadable count is not zero.
   */
  unhandledExpired: number | null;
}

interface SweepRow extends GameServerRow {
  billing_service_id: string;
}

async function chargeRenewal(row: SweepRow): Promise<boolean> {
  const price = Number(row.monthly_price);
  // A missing or non-positive price is NOT a free renewal. This used to
  // `return true` here, so a row whose monthly_price was never written was
  // extended 30 days, counted as renewed and sent a $0.00 receipt — every
  // month, forever, with nothing in the summary to say so. There is no notion
  // of a free plan on this platform; such a row is broken. Thrown rather than
  // returned false, because false means "could not charge" and the caller
  // answers that by suspending the server and telling the customer to top up
  // — the wrong message for our own bad data. The throw lands in the sweep's
  // error path: counted, logged with the server id, nothing extended, nothing
  // emailed, retried on the next sweep.
  if (!Number.isFinite(price) || !(price > 0)) {
    throw new Error(
      `monthly_price is ${row.monthly_price === null || row.monthly_price === undefined ? "missing" : JSON.stringify(row.monthly_price)} — not a free renewal, not renewing`,
    );
  }
  // Charge and record together. Previously the deduct stood alone and the
  // ledger row was fired off with .catch(console.warn) — and a renewal runs
  // unattended every month, so an unrecorded one was the least likely of any
  // charge on the platform to be noticed and the most likely to be disputed a
  // year later. If the row cannot be written the renewal does not happen,
  // which is the honest outcome: no money moves either.
  try {
    await Billing.move_credit({
      userId: row.user_id!,
      amount: price,
      direction: "debit",
      type: "recurring",
      serviceId: row.billing_service_id,
      serviceType: "game_server",
      description: `Game server renewal: ${row.name} (1 month)`,
      metadata: { server_id: row.id, plan_slug: row.plan_slug },
    });
  } catch {
    return false;
  }
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
  const summary: RenewalSweepSummary = { scanned: 0, renewed: 0, suspended: 0, recovered: 0, deleted: 0, errors: 0, unhandledExpired: null };

  const horizon = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("game_servers")
    .select(
      "id, name, game_type, status, user_id, identifier, ptero_server_id, ip, port, plan_slug, region, host_id, monthly_price, auto_renew, ends_at, grace_until, suspended_at, details, billing_service_id",
    )
    .in("status", ["active", "suspended"])
    .lte("ends_at", horizon);
  if (error) throw new Error(`Renewal sweep query failed: ${error.message}`);

  // Past-expiry rows in any OTHER status are deliberately not swept — they are
  // mid-provision (provisioning/installing) or terminal (failed) — but they
  // must not be invisible either: a server stuck in "installing" past its paid
  // month is exactly the row nobody bills and nobody notices. Counted, not
  // widened. A NULL status is counted too: unknown is not "handled".
  const { count: unhandled, error: countError } = await supabase
    .from("game_servers")
    .select("id", { count: "exact", head: true })
    .lt("ends_at", new Date().toISOString())
    .or("status.is.null,status.not.in.(active,suspended,terminated,deleted)");
  if (countError || unhandled === null) {
    // An unreadable count is not zero.
    summary.errors++;
    console.error(`[game-renewals] unhandled-expiry count failed: ${countError?.message ?? "no count returned"}`);
  } else {
    summary.unhandledExpired = unhandled;
    if (unhandled > 0) {
      console.warn(`[game-renewals] ${unhandled} past-expiry server(s) in statuses the sweep does not handle (not active/suspended/terminated/deleted)`);
    }
  }

  for (const row of (data ?? []) as SweepRow[]) {
    summary.scanned++;
    try {
      if (!row.user_id || !row.ends_at) {
        // A row the sweep cannot act on is an error, not a pass. It used to
        // `continue` silently, leaving an unowned or undated server active past
        // expiry with no trace in the summary.
        const missing = [!row.user_id && "user_id", !row.ends_at && "ends_at"].filter(Boolean).join(", ");
        summary.errors++;
        console.error(`[game-renewals] server ${row.id}: missing ${missing} — cannot be swept`);
        continue;
      }
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
