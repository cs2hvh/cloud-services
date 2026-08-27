/**
 * GET /api/v2/admin/deployments — what the build queue is doing right now.
 *
 * The one operator view that did not exist. Fleet, hostnames, workloads and
 * storage all compare recorded state against reality; none of them answered "is
 * anything building, and did the last thing fail?" — so the only way to see a
 * build was to read the worker's stdout on whichever machine happened to be
 * running it. Every stuck deployment in this project so far was diagnosed that
 * way, which is not something an operator can do.
 *
 * The reading lives in lib/paas/telemetry/operator.ts, like every other admin
 * view. A route may not hold the service-role client itself — boundary.test.ts
 * enforces that, and it caught this file when it did.
 */

import { queueView } from "@/lib/paas/telemetry/operator";
import { json } from "../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  try {
    return json(await queueView());
  } catch (e) {
    // NOT an empty queue. "Nothing is building" and "we could not ask" look the
    // same on a dashboard and mean opposite things — the first is calm, the
    // second is the operator's problem.
    return upstreamFailed(`could not read the build queue: ${(e as Error).message.slice(0, 200)}`);
  }
}
