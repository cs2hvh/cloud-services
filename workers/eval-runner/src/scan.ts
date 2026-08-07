import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueRequest, Logger } from "@ahura/runner-core";

export interface EvalJob {
  runId: string;
  datasetId: string;
  modelId: string;
  scorerType: "llm_judge" | "exact" | "contains" | "regex" | "json_schema";
  scorerConfig: Record<string, unknown>;
  orgId: string;
}

/** Returns up to 1 queued eval run to enqueue via the BullMQ claimer. */
export async function scanRuns(
  supabase: SupabaseClient,
  logger: Logger
): Promise<EnqueueRequest<EvalJob>[]> {
  const { data, error } = await supabase
    .schema("inference")
    .from("eval_runs")
    .select("id, dataset_id, model_id, scorer_type, scorer_config, org_id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    logger.error({ err: error.message }, "eval run scan failed");
    return [];
  }

  return (data ?? []).map((r) => ({
    name: "eval-job",
    jobId: r.id as string, // deterministic — dedupes across restarts
    data: {
      runId: r.id as string,
      datasetId: r.dataset_id as string,
      modelId: r.model_id as string,
      scorerType: r.scorer_type as EvalJob["scorerType"],
      scorerConfig: (r.scorer_config ?? {}) as Record<string, string>,
      orgId: r.org_id as string,
    },
  }));
}
