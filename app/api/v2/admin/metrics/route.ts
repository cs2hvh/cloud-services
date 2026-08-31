/**
 * GET /api/v2/admin/metrics
 *
 * Per-app CPU and memory from the metrics.k8s.io aggregated API.
 *
 * RETURNS 502 WHEN metrics-server IS NOT INSTALLED, rather than an empty list.
 * An idle app and a missing metrics API produce the same number, so a
 * dashboard rendering 0m CPU for every app looks like a working dashboard
 * reporting a quiet fleet. Failing loudly is the only honest option: the
 * caller learns the capability is absent instead of drawing a conclusion from
 * a number nobody measured.
 *
 * Quantity parsing lives in lib/paas/telemetry/metrics.ts and is unit-tested,
 * because it is where this silently goes wrong. metrics-server reports CPU in
 * nanocores and memory in kibibytes, and reading `Mi` as `M` understates every
 * memory figure by 4.6% without raising anything.
 */

import { metricsView } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await metricsView();
    return json({
      ...view,
      headline: {
        deployments: view.deployments.length,
        // null rather than 0 when any deployment's figure is unknown — a
        // partial sum would understate the fleet while looking precise.
        totalCpuCores: view.deployments.some((d) => d.cpuCores === null)
          ? null
          : view.deployments.reduce((n, d) => n + (d.cpuCores ?? 0), 0),
        totalMemoryBytes: view.deployments.some((d) => d.memoryBytes === null)
          ? null
          : view.deployments.reduce((n, d) => n + (d.memoryBytes ?? 0), 0),
        unreadablePods: view.unreadable,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
