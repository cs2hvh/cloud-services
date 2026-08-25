/**
 * Reading the audit trail — pure, DB-free, UI-free.
 *
 * Doc 21 §3: "audit exists as data but not as a surface. inference.audit_log is
 * written faithfully by the CRUD routes and nobody can read it outside SQL."
 * This is the reading half; lib/admin/audit.ts is the writing half.
 *
 * The trail mixes two very different kinds of event and the distinction is the
 * point of the screen:
 *   - CUSTOMER actions — what a user did in their own org (key.created, …)
 *   - ADMIN actions    — what staff did to the platform or to a customer
 *                        (admin.*), recorded with org_id NULL for catalog-wide
 *                        changes. See migration 20260729000001.
 * Mixing them in one undifferentiated list would hide exactly the rows an
 * incident review is looking for.
 */

export interface AuditRow {
  id: string;
  org_id: string | null;
  actor_user_id: string | null;
  actor_api_key_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type ActorKind = "admin" | "user" | "api_key" | "system";
export type EventScope = "admin" | "customer";

/** `admin.*` is the reserved prefix for staff actions (migration 20260729000001). */
export function eventScope(row: Pick<AuditRow, "action">): EventScope {
  return row.action.startsWith("admin.") ? "admin" : "customer";
}

/**
 * Who did it. An API-key actor is distinct from a human: it means the change
 * came through the API, which matters when working out how something happened.
 */
export function actorKind(row: AuditRow): ActorKind {
  if (eventScope(row) === "admin") return "admin";
  if (row.actor_api_key_id) return "api_key";
  if (row.actor_user_id) return "user";
  return "system";
}

/** Actions that changed money or access — what a review looks at first. */
const SENSITIVE = new Set([
  "admin.model_price_updated",
  "admin.model_bulk_repriced",
  "admin.org_limits_updated",
  "admin.key_revoked",
  "admin.key_updated",
  "admin.model_activation_changed",
  "key.created",
  "key.revoked",
  "byok_key.created",
  "byok_key.deleted",
]);

export function isSensitive(row: Pick<AuditRow, "action">): boolean {
  return SENSITIVE.has(row.action);
}

/**
 * The before/after list an admin write recorded, if any.
 *
 * Returned as a plain array so the UI can render "60 → 120" without knowing
 * the metadata shape. Rows written before this feature, or by customer paths,
 * simply have none.
 */
export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

export function changesOf(row: AuditRow): AuditChange[] {
  const raw = row.metadata?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is AuditChange => !!c && typeof c === "object" && typeof (c as AuditChange).field === "string"
  );
}

/** A short human sentence for the row, so the list reads without decoding. */
export function describe(row: AuditRow): string {
  const changes = changesOf(row);
  const target = row.target_id ?? row.target_type;

  switch (row.action) {
    case "admin.model_price_updated": {
      const parts = changes.map((c) => `${c.field.replace("_cents_per_mtok", "")} ${c.from} → ${c.to}`);
      const forced = row.metadata?.below_cost_override === true ? " (below cost, forced)" : "";
      return `Repriced ${target}: ${parts.join(", ")}${forced}`;
    }
    case "admin.model_bulk_repriced": {
      const n = row.metadata?.models_updated ?? 0;
      const margin = row.metadata?.target_margin_pct;
      return `Bulk repriced ${n} model(s) to ${margin}% margin`;
    }
    case "admin.model_activation_changed":
      return `${row.metadata?.is_active ? "Enabled" : "Disabled"} ${target}`;
    case "admin.org_limits_updated":
      return `Changed limits: ${changes.map((c) => `${c.field} ${c.from ?? "none"} → ${c.to ?? "none"}`).join(", ")}`;
    case "admin.key_revoked":
      return `Revoked API key ${target}`;
    case "admin.key_updated":
      return `Updated API key ${target}: ${changes.map((c) => `${c.field} → ${c.to}`).join(", ")}`;
    default:
      return `${row.action} · ${target}`;
  }
}

// ── Filtering ────────────────────────────────────────────────────────────────

export interface AuditFilter {
  scope?: EventScope | "any";
  action?: string;
  orgId?: string;
  actorUserId?: string;
  sensitiveOnly?: boolean;
  search?: string;
}

export function applyFilter(rows: AuditRow[], filter: AuditFilter): AuditRow[] {
  const term = filter.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.scope && filter.scope !== "any" && eventScope(row) !== filter.scope) return false;
    if (filter.action && row.action !== filter.action) return false;
    if (filter.orgId && row.org_id !== filter.orgId) return false;
    if (filter.actorUserId && row.actor_user_id !== filter.actorUserId) return false;
    if (filter.sensitiveOnly && !isSensitive(row)) return false;
    if (term) {
      const haystack = `${row.action} ${row.target_type} ${row.target_id ?? ""} ${describe(row)}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

export interface AuditSummary {
  total: number;
  admin_events: number;
  customer_events: number;
  sensitive: number;
  distinct_actors: number;
  system_events: number;
}

export function summarize(rows: AuditRow[]): AuditSummary {
  const actors = new Set<string>();
  let admin = 0;
  let sensitive = 0;
  let system = 0;
  for (const row of rows) {
    if (eventScope(row) === "admin") admin++;
    if (isSensitive(row)) sensitive++;
    const kind = actorKind(row);
    if (kind === "system") system++;
    if (row.actor_user_id) actors.add(row.actor_user_id);
  }
  return {
    total: rows.length,
    admin_events: admin,
    customer_events: rows.length - admin,
    sensitive,
    distinct_actors: actors.size,
    system_events: system,
  };
}

/** Action counts, most frequent first — the shape of what happens here. */
export function actionCounts(rows: AuditRow[]): Array<{ action: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}
