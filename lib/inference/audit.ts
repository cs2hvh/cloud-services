/**
 * recordAudit() — fire-and-forget audit event writer for the Inference platform.
 *
 * Called from Next.js mutating routes (API key CRUD, BYOK CRUD, org settings,
 * members) to populate inference.audit_log. Writes directly via the service-role
 * Supabase client — for mutating-route volumes (low cardinality, low rate) this
 * is faster and simpler than going through the CF Queue path.
 *
 * High-volume audit needs (e.g. per-request from the gateway) still go through
 * the AUDIT_EVENTS queue + consumer in the Worker. This helper is for the slow
 * path only.
 *
 * Errors are caught and logged; the caller's request is never failed because
 * of audit-write failure. Audit data is best-effort durability, not blocking.
 */
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Matches the inference.audit_action enum in supabase/migrations/20260523000001
export type InferenceAuditAction =
  | "org.created"
  | "org.updated"
  | "org.deleted"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "key.created"
  | "key.rotated"
  | "key.revoked"
  | "key.scope_changed"
  | "key.budget_changed"
  | "byok.added"
  | "byok.removed"
  | "finetune.created"
  | "finetune.cancelled"
  | "deployment.created"
  | "deployment.updated"
  | "deployment.deleted"
  | "collection.created"
  | "collection.deleted";

export interface RecordAuditInput {
  orgId: string;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: InferenceAuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { error } = await supabase.schema("inference").from("audit_log").insert({
      org_id: input.orgId,
      actor_user_id: input.actorUserId ?? null,
      actor_api_key_id: input.actorApiKeyId ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    });

    if (error) {
      console.error("[inference/audit] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[inference/audit] write threw:", err);
  }
}

/**
 * Pull the caller IP + User-Agent from a NextRequest with sensible header
 * fallbacks. Works behind Cloudflare (cf-connecting-ip), behind a reverse proxy
 * (x-real-ip), and behind a public load balancer (x-forwarded-for, first hop).
 */
export function auditContextFrom(request: NextRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const h = request.headers;
  const ipAddress =
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return {
    ipAddress,
    userAgent: h.get("user-agent"),
  };
}
