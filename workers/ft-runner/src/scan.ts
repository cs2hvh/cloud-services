/**
 * Claimer scan for ft-runner: find queued finetunes and map them to BullMQ
 * jobs. The generic polling/enqueue/dedup machinery lives in runner-core's
 * Claimer; this is the only ft-specific part.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueRequest, Logger } from "@ahura/runner-core";
import type { JobPayload } from "./lifecycle.js";

const PAGE_SIZE = 50;

export async function scanFinetunes(
  supabase: SupabaseClient,
  logger: Logger
): Promise<EnqueueRequest<JobPayload>[]> {
  const { data, error } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id, created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(PAGE_SIZE);

  if (error) {
    logger.warn({ err: error.message }, "claimer poll failed");
    return [];
  }
  if (!data || data.length === 0) return [];

  logger.info({ count: data.length }, "queued jobs found");
  return data.map((row) => ({
    name: "ft-job",
    jobId: row.id, // deterministic — dedupes across restarts
    data: { jobId: row.id },
  }));
}
