/**
 * Audit trail for admin mutations.
 *
 * Doc 21 §5.2: "Audit every admin mutation from day one, or the audit section
 * in A6 ships with a hole." The bulk reprice of 21 models on 2026-07-28 left no
 * record of who ran it or what the prices were before — this is what stops that
 * happening again.
 *
 * Two design rules:
 *
 * 1. **Record the BEFORE value, not just the after.** "price set to 120" is
 *    almost useless; "120, was 60" is what an operator needs six weeks later
 *    when a customer disputes a bill. Every builder below carries both.
 * 2. **Never let an audit failure break the operation.** The write is
 *    fire-and-forget: an admin action that succeeded must not report failure
 *    because the trail could not be appended. Failures are logged instead —
 *    same posture as lib/inference/audit.ts.
 *
 * Platform-scoped actions (catalog pricing) record `org_id: null`, which the
 * org-scoped RLS read cannot match — so admin rows stay out of customer audit
 * views by construction. Requires migration 20260729000001.
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type AdminAuditAction =
  | "admin.model_price_updated"
  | "admin.model_bulk_repriced"
  | "admin.model_activation_changed"
  | "admin.org_limits_updated"
  | "admin.key_updated"
  | "admin.key_revoked"
  | "admin.job_retried"
  | "admin.job_cancelled"
  | "admin.feature_switch_changed";

export interface AdminAuditEntry {
  action: AdminAuditAction;
  /** Null for platform-scoped actions such as catalog pricing. */
  org_id: string | null;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
}

/** A single field's before/after, the shape every price diff uses. */
export interface FieldChange {
  field: string;
  from: number | string | boolean | null;
  to: number | string | boolean | null;
}

/**
 * Keep only fields that actually moved.
 *
 * A PUT sends every field on the form, so recording all of them would bury the
 * one real change in noise and make "what changed?" unanswerable.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[]
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const from = (before?.[field] ?? null) as FieldChange["from"];
    const to = (after?.[field] ?? null) as FieldChange["to"];
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

// ── Entry builders (pure — this is what the tests cover) ─────────────────────

export function modelPriceEntry(modelId: string, changes: FieldChange[], forced: boolean): AdminAuditEntry {
  return {
    action: "admin.model_price_updated",
    org_id: null,
    target_type: "model",
    target_id: modelId,
    // `forced` marks a deliberate below-cost save. That is the single most
    // important thing to be able to find later.
    metadata: { changes, below_cost_override: forced },
  };
}

export function modelActivationEntry(modelId: string, isActive: boolean): AdminAuditEntry {
  return {
    action: "admin.model_activation_changed",
    org_id: null,
    target_type: "model",
    target_id: modelId,
    metadata: { is_active: isActive },
  };
}

export function bulkRepriceEntry(
  targetMarginPct: number,
  applied: string[],
  changes: Array<{ model_id: string; field: string; from: number | null; to: number }>,
  scope: "underwater" | "all"
): AdminAuditEntry {
  return {
    action: "admin.model_bulk_repriced",
    org_id: null,
    target_type: "model_catalog",
    target_id: null,
    metadata: {
      target_margin_pct: targetMarginPct,
      scope,
      models_updated: applied.length,
      models: applied,
      // The full diff, so a bulk run is reversible by hand if it was wrong.
      changes,
    },
  };
}

export function orgLimitsEntry(orgId: string, changes: FieldChange[]): AdminAuditEntry {
  return {
    action: "admin.org_limits_updated",
    org_id: orgId,
    target_type: "org",
    target_id: orgId,
    metadata: { changes },
  };
}

export function keyEntry(
  keyId: string,
  orgId: string | null,
  changes: FieldChange[],
  revoked: boolean
): AdminAuditEntry {
  return {
    action: revoked ? "admin.key_revoked" : "admin.key_updated",
    org_id: orgId,
    target_type: "api_key",
    target_id: keyId,
    metadata: { changes },
  };
}

/**
 * Retrying or cancelling one customer's job.
 *
 * `from`/`to` are both recorded because a job action is only reconstructable
 * from the pair — "cancelled" alone does not say whether an operator killed a
 * live run or tidied up a row that had already failed. Scoped to the customer's
 * org, unlike the catalog actions, because this acted on their work.
 */
export function jobActionEntry(
  action: "retry" | "cancel",
  service: string,
  source: string,
  jobId: string,
  orgId: string | null,
  from: string,
  to: string
): AdminAuditEntry {
  return {
    action: action === "retry" ? "admin.job_retried" : "admin.job_cancelled",
    org_id: orgId,
    target_type: service,
    target_id: jobId,
    metadata: { source, status_from: from, status_to: to },
  };
}

/**
 * Flipping a platform capability on or off.
 *
 * The single highest-consequence admin action there is — turning `ai_inference`
 * off stops every customer request on the platform — so it records the reason
 * the operator gave alongside the change.
 */
export function featureSwitchEntry(
  key: string,
  enabled: boolean,
  previous: boolean,
  reason: string | null
): AdminAuditEntry {
  return {
    action: "admin.feature_switch_changed",
    org_id: null,
    target_type: "feature_switch",
    target_id: key,
    metadata: { enabled, was: previous, reason },
  };
}

// ── Write (fire-and-forget) ──────────────────────────────────────────────────

export interface AdminActor {
  userId?: string;
  email?: string;
}

/** Caller IP and user-agent, for the trail. Best-effort. */
export function actorContext(req: NextRequest): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent"),
  };
}

/**
 * Append one admin action to inference.audit_log.
 *
 * Deliberately not awaited by callers: an admin operation that already
 * succeeded must not fail because its audit row could not be written.
 */
export async function recordAdminAudit(
  entry: AdminAuditEntry,
  actor: AdminActor,
  context?: { ip: string | null; userAgent: string | null }
): Promise<void> {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await supabase
      .schema("inference")
      .from("audit_log")
      .insert({
        org_id: entry.org_id,
        actor_user_id: actor.userId ?? null,
        action: entry.action,
        target_type: entry.target_type,
        target_id: entry.target_id,
        // The admin's email is carried in metadata rather than a column: the
        // table has no actor_email, and a user id alone is unreadable in an
        // incident review.
        metadata: { ...entry.metadata, actor_email: actor.email ?? null },
        ip_address: context?.ip ?? null,
        user_agent: context?.userAgent ?? null,
      });
    if (error) console.error("[admin-audit] failed to record", entry.action, error.message);
  } catch (err) {
    console.error("[admin-audit] failed to record", entry.action, err);
  }
}
