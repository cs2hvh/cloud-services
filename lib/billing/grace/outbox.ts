import { createServiceClient } from "@/lib/supabase/server";
import type { GraceServiceTable } from "@/lib/billing/grace/constants";

type OutboxStatus = "pending" | "processing" | "processed" | "failed";

export async function enqueueGraceOutboxEvent(params: {
  eventKey: string;
  eventType: string;
  userId: string;
  serviceTable?: GraceServiceTable;
  serviceId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .schema("billing")
    .from("notification_outbox")
    .upsert(
      {
        event_key: params.eventKey,
        event_type: params.eventType,
        user_id: params.userId,
        service_table: params.serviceTable ?? null,
        service_id: params.serviceId ?? null,
        payload: params.payload ?? {},
        status: "pending" satisfies OutboxStatus,
        updated_at: nowIso,
      },
      { onConflict: "event_key" }
    );

  if (error) {
    throw new Error(`Failed to enqueue outbox event: ${error.message}`);
  }
}
