/**
 * GET /api/v2/admin/storage
 *
 * R2 objects against paas.deployments.
 *
 * Nothing prunes this bucket. Every deployment writes an OCI tarball, a build
 * log and a metadata file, and no code path deletes any of them — so it grows
 * monotonically with every deploy and appears in no other report.
 *
 * READ-ONLY, and there is deliberately no delete endpoint here or anywhere.
 * A mapping bug in a fleet reconciler produces a confusing report; the same
 * bug behind a bucket reaper destroys every app's build logs, and object
 * deletion has no undo. `reclaimable` is a recommendation for a human.
 */

import { r2View } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await r2View();
    const d = view.drift;
    return json({
      ...view,
      headline: {
        totalBytes: d.totalBytes,
        reclaimableBytes: d.reclaimableBytes,
        reclaimablePercent:
          d.totalBytes === 0 ? 0 : Math.round((d.reclaimableBytes / d.totalBytes) * 100),
        monthlyUsd: d.totalMonthlyUsd,
        reclaimableMonthlyUsd: d.reclaimableMonthlyUsd,
        // An object whose key shape is not recognised is never proposed for
        // deletion, and keeps the report dirty so it cannot be ignored.
        unclassified: d.byDisposition.unknown.objects,
        clean: d.clean,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
