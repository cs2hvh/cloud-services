import { requireAdmin } from "@/lib/supabase/auth";
import { AuditLogService } from "@/lib/audit/service";
import type { AuditServiceType } from "@/lib/audit/types";

/**
 * Gate + audit trail for admin surfaces that READ customer data (the v2
 * project browser, per-user billing). Conditions set by the Deploy v2 lane
 * when these surfaces were approved:
 *
 * - Explicitly gated, never inherited: this function is the surface's own
 *   knob. Today it requires an authenticated admin AND, when
 *   CUSTOMER_DATA_ADMINS is set (comma-separated emails), membership in that
 *   list — so customer-data access can be narrowed below "operator" without
 *   touching any other surface. Unset, it matches the admin gate.
 * - Every page load that shows customer data writes an audit row: which
 *   admin, which customer/project, what was viewed, when. That trail is what
 *   makes these surfaces defensible to a compliance reviewer.
 * - Never expose env var VALUES (they are ciphertext in paas.env_vars and
 *   stay that way — queries select keys only), and no repository contents:
 *   repo full names and SHAs are fine, commit messages/diffs/source are not.
 */
export async function requireCustomerDataAccess(): Promise<
  { ok: true; userId: string; email: string } | { ok: false }
> {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId || !admin.email) return { ok: false };

  const allowlist = (process.env.CUSTOMER_DATA_ADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(admin.email.toLowerCase())) {
    console.warn(
      `[customer-data] ${admin.email} is an admin but not in CUSTOMER_DATA_ADMINS`,
    );
    return { ok: false };
  }

  return { ok: true, userId: admin.userId, email: admin.email };
}

/** One audit row per customer-data page view. Fire-and-forget is forbidden — await it. */
export async function auditCustomerRead(params: {
  admin: { userId: string; email: string };
  serviceType: Extract<AuditServiceType, "platform_apps" | "billing">;
  /** The customer/project the read was about, e.g. "prj-…" or a user id. */
  subjectId: string;
  subjectName: string;
  /** What was viewed, e.g. "project detail: deployments, env keys, charges". */
  viewed: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await AuditLogService.create({
    user_id: params.admin.userId,
    user_role: "admin",
    user_email: params.admin.email,
    action: "access",
    service_type: params.serviceType,
    service_id: params.subjectId,
    service_name: params.subjectName,
    metadata: { via: "admin-panel", viewed: params.viewed, ...params.metadata },
  });
}
