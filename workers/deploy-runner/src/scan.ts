/**
 * Claimer scan for deploy-runner. Mirrors the previous two-scan claimer:
 *   status='building'                              → enqueue create
 *   status='paused' + runpod_endpoint_id NOT NULL  → enqueue delete
 *
 * 'scale' is enqueued by the API directly (no claimer path). The generic
 * polling/enqueue/dedup machinery lives in runner-core's Claimer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueRequest, Logger } from "@ahura/runner-core";
import type { DeployJobPayload } from "./lifecycle.js";

const PAGE_SIZE = 50;

export async function scanDeployments(
  supabase: SupabaseClient,
  logger: Logger
): Promise<EnqueueRequest<DeployJobPayload>[]> {
  const out: EnqueueRequest<DeployJobPayload>[] = [];

  // building → create
  const { data: building, error: buildErr } = await supabase
    .schema("inference")
    .from("deployments")
    .select("id")
    .eq("status", "building")
    .order("created_at", { ascending: true })
    .limit(PAGE_SIZE);
  if (buildErr) {
    logger.warn({ err: buildErr.message }, "scanBuilding poll failed");
  } else {
    for (const row of building ?? []) {
      out.push({ name: "deploy-job", jobId: `${row.id}:create`, data: { deploymentId: row.id, action: "create" } });
    }
  }

  // paused + endpoint → delete
  const { data: paused, error: pausedErr } = await supabase
    .schema("inference")
    .from("deployments")
    .select("id")
    .eq("status", "paused")
    .not("runpod_endpoint_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(PAGE_SIZE);
  if (pausedErr) {
    logger.warn({ err: pausedErr.message }, "scanPaused poll failed");
  } else {
    for (const row of paused ?? []) {
      out.push({ name: "deploy-job", jobId: `${row.id}:delete`, data: { deploymentId: row.id, action: "delete" } });
    }
  }

  return out;
}
