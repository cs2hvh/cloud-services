/**
 * GET /api/v2/admin/fleet
 *
 * Linode reality against paas.clusters and paas.build_vms, priced.
 *
 * This endpoint exists because a reconciler nobody runs is the same as no
 * reconciler. The cluster, its nodes and its NodeBalancer ran at $116.07/month
 * with both fleet tables empty, and it was caught by a person reading a
 * database by hand rather than by anything in the system.
 *
 * Classification and pricing are in lib/paas/telemetry/reconcile.ts, unit
 * tested without credentials. This route authorises, calls, and serialises.
 */

import { fleetView } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

/** Live infrastructure state; never serve a cached answer about money. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await fleetView();
    return json({
      ...view,
      // Lead with the number that matters. `unaccountedHourly` is spend Linode
      // is billing that no control-plane row admits exists, and it is
      // deliberately not the same as "anything non-clean" — a phantom row is
      // drift that costs nothing.
      headline: {
        unaccountedHourly: view.drift.unaccountedHourly,
        standingMonthly: view.monthly.standing,
        actionable: view.drift.findings.filter((f) => f.actionable).length,
        clean: view.drift.clean,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
