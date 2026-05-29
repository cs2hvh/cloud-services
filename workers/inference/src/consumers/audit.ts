/**
 * AUDIT_EVENTS queue consumer.
 *
 * Drains audit events and batch-inserts them into inference.audit_log.
 * Append-only — no updates, no upserts. Failed batches retry up to the
 * Worker's max_retries setting (configured in wrangler.toml).
 */
import { createClient } from "@supabase/supabase-js";
import type { AuditEvent, Env } from "../types.ts";

export async function handleAuditBatch(
  batch: MessageBatch<AuditEvent>,
  env: Env
): Promise<void> {
  if (batch.messages.length === 0) return;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-audit-consumer" } },
  });

  const rows = batch.messages.map((m) => ({
    org_id: m.body.orgId,
    actor_user_id: m.body.actorUserId,
    actor_api_key_id: m.body.actorApiKeyId,
    action: m.body.action,
    target_type: m.body.targetType,
    target_id: m.body.targetId,
    metadata: m.body.metadata,
    ip_address: m.body.ipAddress,
    user_agent: m.body.userAgent,
    created_at: m.body.occurredAt,
  }));

  const { error } = await supabase
    .schema("inference")
    .from("audit_log")
    .insert(rows);

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "audit-consumer",
        message: "Failed to insert audit rows",
        count: rows.length,
        err: error.message,
      })
    );
    batch.retryAll();
    return;
  }

  batch.ackAll();

  console.log(
    JSON.stringify({
      level: "info",
      scope: "audit-consumer",
      message: "Flushed audit batch",
      count: rows.length,
    })
  );
}
