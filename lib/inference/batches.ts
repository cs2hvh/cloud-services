/**
 * Shared types + serializers for the batch endpoint. Kept out of the
 * route files so multiple endpoints (list, get, cancel, processor) can
 * import without duplicating the row shape or the OpenAI-mapper.
 */

export type BatchStatus =
  | "validating"
  | "failed"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "expired"
  | "cancelling"
  | "cancelled";

export interface BatchRow {
  id: string;
  org_id: string;
  created_by: string | null;
  endpoint: string;
  input_file_id: string;
  output_file_id: string | null;
  error_file_id: string | null;
  status: BatchStatus;
  completion_window: string;
  request_counts: { total: number; completed: number; failed: number };
  metadata: Record<string, string>;
  errors: unknown | null;
  created_at: string;
  in_progress_at: string | null;
  finalizing_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  expired_at: string | null;
  cancelling_at: string | null;
  cancelled_at: string | null;
  expires_at: string;
}

/**
 * Maps an inference.batches row to the OpenAI batch response shape.
 * Timestamps become Unix seconds; nulls become undefined; field names
 * mirror OpenAI's API exactly.
 */
export function serializeBatch(row: BatchRow): Record<string, unknown> {
  const t = (s: string | null) => (s ? Math.floor(new Date(s).getTime() / 1000) : undefined);
  return {
    id: row.id,
    object: "batch",
    endpoint: row.endpoint,
    errors: row.errors ?? undefined,
    input_file_id: row.input_file_id,
    completion_window: row.completion_window,
    status: row.status,
    output_file_id: row.output_file_id ?? undefined,
    error_file_id: row.error_file_id ?? undefined,
    created_at: t(row.created_at),
    in_progress_at: t(row.in_progress_at),
    expires_at: t(row.expires_at),
    finalizing_at: t(row.finalizing_at),
    completed_at: t(row.completed_at),
    failed_at: t(row.failed_at),
    expired_at: t(row.expired_at),
    cancelling_at: t(row.cancelling_at),
    cancelled_at: t(row.cancelled_at),
    request_counts: row.request_counts,
    metadata: row.metadata,
  };
}
