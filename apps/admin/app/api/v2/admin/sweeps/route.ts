/**
 * GET /api/v2/admin/sweeps
 *
 * Are the observers themselves running? Every other operator view reports on
 * the platform; none of them can report that the sweep feeding it has been
 * failing since it was installed — a sweep that never runs produces silence,
 * and silence renders exactly like a clean result.
 *
 * Lives in the admin panel only for now (sweepView existed with no route);
 * shape and guard usage follow app/api/v2/admin/fleet/route.ts exactly, and
 * this file is offered to the v2 lane for upstreaming.
 */

import { sweepView } from "@/lib/paas/telemetry/operator";
import { json } from "@/app/api/v2/_lib/http";
import {
  adminNotFound,
  getOperator,
  upstreamFailed,
} from "@/app/api/v2/admin/_lib/guard";

/** Live cluster state; never a cached answer about whether observers run. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await sweepView();
    return json({
      ...view,
      headline: {
        clean: view.report.clean,
        unobserved: view.report.unobserved,
        untranslated: view.report.untranslated,
        // Worst first — the report is already sorted that way.
        worst: view.report.sweeps[0]?.status ?? null,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
