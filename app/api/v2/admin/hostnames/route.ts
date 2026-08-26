/**
 * GET /api/v2/admin/hostnames
 *
 * Cloudflare DNS against cluster Ingress objects against paas.aliases.
 *
 * The finding worth surfacing is `claimable`: a record resolving to our
 * gateway that no Ingress routes. Traefik 404s it today, so it looks like
 * housekeeping — but the hostname is pointed at us and unclaimed, and the next
 * Ingress to name it, in any tenant namespace, receives its traffic.
 *
 * Read-only. Nothing here deletes a DNS record: doing that on the strength of
 * a classification is how a working app goes dark, and the zone carries 30
 * live production records this platform did not create.
 */

import { hostnameView } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await hostnameView();
    return json({
      ...view,
      headline: {
        claimable: view.drift.claimable,
        actionable: view.drift.findings.filter((f) => f.actionable).length,
        clean: view.drift.clean,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
