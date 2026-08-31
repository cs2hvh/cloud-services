/**
 * GET /api/v2/admin/usage
 *
 * What is running right now, what the build tier has spent in 24 hours, and
 * which signals are up.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN: a warm fraction. It is an
 * accumulation over time and cannot be derived from one observation. A handler
 * that computed one would either invent a number or re-introduce v1's defect —
 * metering that runs only when someone opens a page, so an app nobody visits
 * is never metered and never billed. The arithmetic exists and is tested in
 * lib/paas/telemetry/usage.ts; it needs the sampler persisting samples, which
 * needs a table.
 *
 * Build figures ARE exact, because paas.build_vms records both ends of every
 * VM's life. A row with no destroyed_at contributes zero rather than an
 * open-ended interval — a leaked VM must not become an unbounded invoice —
 * and is raised as a critical signal instead.
 */

import { usageView } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await usageView();
    return json({
      ...view,
      headline: {
        apps: view.apps.length,
        pods: view.apps.reduce((n, a) => n + a.pods, 0),
        buildsLast24h: view.builds.builds,
        buildMinutesLast24h: view.builds.buildSeconds / 60,
        critical: view.summary.critical,
        warn: view.summary.warn,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
