import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueRequest, Logger } from "@ahura/runner-core";

/** Minimal job payload — the lifecycle re-reads the full row after it wins the
 *  atomic claim, so the scan only needs to identify the run. */
export interface AgentJob {
  runId: string;
  orgId: string;
}

/** Returns up to 1 queued agent run to enqueue via the BullMQ claimer.
 *  `jobId = run.id` makes enqueues idempotent across restarts (BullMQ dedupe);
 *  the claim in lifecycle.ts is what actually prevents double-execution. */
export async function scanRuns(
  supabase: SupabaseClient,
  logger: Logger
): Promise<EnqueueRequest<AgentJob>[]> {
  const { data, error } = await supabase
    .schema("agentcore")
    .from("runs")
    .select("id, org_id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    logger.error({ err: error.message }, "agent run scan failed");
    return [];
  }

  return (data ?? []).map((r) => ({
    name: "agent-job",
    jobId: r.id as string, // deterministic — dedupes across restarts
    data: {
      runId: r.id as string,
      orgId: r.org_id as string,
    },
  }));
}
