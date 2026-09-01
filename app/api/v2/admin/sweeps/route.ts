/**
 * GET /api/v2/admin/sweeps
 *
 * Are the observers themselves running? Every other operator view reports on
 * the platform; none of them can report that the sweep feeding it has been
 * failing since it was installed — a sweep that never runs produces silence,
 * and silence renders exactly like a clean result.
 *
 * `sweepView()` had existed in telemetry/operator.ts with no route, so this
 * section was reachable only from a server component calling operatorView().
 * That is enough to render it and not enough to alert on it, which is the wrong
 * way round for the one view whose whole job is noticing that something stopped.
 *
 * Written by the admin-panel lane against the shape of ./fleet/route.ts and
 * upstreamed here so both apps share one handler.
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
        // Worst first — sweepHealthReport sorts on a status order that puts
        // never-succeeded ahead of failing ahead of overdue, so index 0 is the
        // one an operator should read first. Null only when there are no
        // CronJobs at all, which is itself worth seeing.
        worst: view.report.sweeps[0]?.status ?? null,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
