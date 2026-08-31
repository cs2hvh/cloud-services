/**
 * GET /api/v2/admin/workloads
 *
 * Kubernetes Deployments against paas.deployments, and recorded pod allocation
 * against reality.
 *
 * The layer /api/v2/admin/fleet structurally cannot see. A workload with no
 * row lives entirely inside Kubernetes, on a node that IS recorded, in a
 * cluster that IS recorded — fleet drift reports clean while the pod rides
 * along holding capacity nobody is selling.
 *
 * `down` leads the response because it is the only status here a customer can
 * see: a `ready` row with no ready replicas means the control plane and every
 * alias pointing at that app believe it is live, and it is not.
 */

import { workloadView } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    const view = await workloadView();
    return json({
      ...view,
      headline: {
        down: view.drift.findings.filter((f) => f.status === "down").length,
        unaccountedPods: view.drift.unaccountedPods,
        observedPods: view.drift.observedPods,
        podAllocatedDrift: view.capacity.drift,
        // LKE enforces the pod cap hard, so a low-drifting number means
        // scheduling onto a cluster that is fuller than the record admits.
        schedulingAgainstFiction: view.capacity.significant,
        clean: view.drift.clean,
      },
    });
  } catch (e) {
    return upstreamFailed((e as Error).message);
  }
}
