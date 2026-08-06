/**
 * RAG / vector storage for operators — pure, DB-free, UI-free.
 *
 * §3 of nextstespsAI/21-admin-platform.md lists vector collections as
 * `see, limit (quota), kill | none` — no operator surface at all. This module is
 * the `see` half.
 *
 * THE QUOTA IS SUMMED FROM `vector_collections.row_count`, NOT from counting
 * `vector_rows`. That is not a shortcut — it is what `checkVectorQuota()` in
 * lib/inference/vector-quota.ts actually reads, so it is the number that decides
 * whether a customer's next upsert is refused. An admin screen that counted
 * vector_rows instead would show a different figure from the one being enforced,
 * and support would explain the wrong number to a customer.
 *
 * Because that cached counter is authoritative for enforcement, drift from the
 * real row count is itself an operator concern: if it reads low a customer gets
 * free headroom, if it reads high they are refused storage they are entitled to.
 * So drift is reported rather than silently corrected.
 */

/** Row of `inference.vector_collections`. */
export interface CollectionRow {
  id: string;
  name: string | null;
  org_id: string;
  /** Cached counter. Authoritative for the quota — see the module note. */
  row_count: number | null;
  size_bytes: number | null;
  dimensions: number | null;
  embedding_model_id: string | null;
  index_type: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Row of `inference.connectors`, reduced to what an operator reads. */
export interface ConnectorRow {
  id: string;
  org_id: string;
  collection_id: string | null;
  display_name: string | null;
  kind: string | null;
  status: string | null;
  sync_schedule: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  next_sync_at: string | null;
  docs_total: number | null;
  docs_failed: number | null;
}

/** Row of `inference.connector_documents`. */
export interface DocumentRow {
  connector_id: string;
  status: string | null;
  chunk_count: number | null;
}

/** Actual vector_rows count per collection, when it was measured. */
export type ActualCounts = Record<string, number>;

/**
 * The DEFAULT ceiling — what an org gets with no explicit override. Mirrors
 * DEFAULT_VECTOR_QUOTA in lib/inference/vector-quota.ts and its two vendored
 * copies (workers/data-runner's lifecycle.ts, workers/inference's
 * vector-collections.ts).
 *
 * This used to be the WHOLE story: the ceiling was a constant in three files
 * while the error customers saw said "contact support to raise your limit", and
 * support had no lever short of a redeploy. Since migration 20260804000001 an org
 * can carry `inference.orgs.vector_quota`, so `rollupByOrg` takes the real
 * per-org values and falls back to this only where none is set.
 */
export const DEFAULT_VECTOR_QUOTA = 1_000_000;

/** @deprecated Kept for existing imports — it is now only the default. */
export const ENFORCED_VECTOR_QUOTA = DEFAULT_VECTOR_QUOTA;

export type QuotaState = "ok" | "watch" | "near" | "full";

/**
 * The quota block the RAG admin route returns.
 *
 * Declared HERE, and imported by both the route and the component, because the
 * admin components hand-write their own response interfaces and TypeScript
 * cannot link them to the route. Renaming `per_org` to `default_per_org` when
 * the quota became per-org compiled clean, passed an API-level E2E, and threw
 * `Cannot read properties of undefined` in the browser. One shared type makes
 * that a build error instead.
 */
export interface RagQuotaInfo {
  /** Platform default. An org with an override reports its own in `OrgRag.quota`. */
  default_per_org: number;
  /** Where the enforced number is summed from. */
  enforced_from: string;
  adjustable: boolean;
  adjustable_note: string;
  adjust_endpoint: string;
}

/** Thresholds chosen so "watch" appears long before a customer is refused. */
export function quotaState(used: number, quota: number): QuotaState {
  if (quota <= 0) return "full";
  const pct = used / quota;
  if (pct >= 1) return "full";
  if (pct >= 0.9) return "near";
  if (pct >= 0.5) return "watch";
  return "ok";
}

export interface CollectionView extends CollectionRow {
  /** row_count as the quota sees it. Never null — absent counts as 0. */
  counted: number;
  /** Real vector_rows count, when measured; null when not. */
  actual: number | null;
  /** actual - counted. Non-zero means the enforced number is wrong. */
  drift: number | null;
  /** Connectors feeding this collection. */
  connector_ids: string[];
  /** True when nothing has ever written to it. */
  empty: boolean;
}

export interface OrgRag {
  org_id: string;
  org_name: string;
  collections: CollectionView[];
  /** Sum of row_count — the number the quota gate compares. */
  vectors_used: number;
  /** Sum of measured actuals, when available. */
  vectors_actual: number | null;
  quota: number;
  quota_pct: number;
  quota_state: QuotaState;
  /** Total drift across the org's collections. */
  drift: number | null;
  size_bytes: number;
  connectors: ConnectorRow[];
  /** Connectors in 'error', which stop feeding their collection. */
  broken_connectors: number;
  /** Documents that failed to index. */
  failed_documents: number;
  /** Collections with zero rows — usually abandoned. */
  empty_collections: number;
  /** Distinct embedding models in use; more than one means mixed dimensions. */
  embedding_models: string[];
}

/** Group everything by org, matching how the quota is enforced. */
export function rollupByOrg(
  collections: CollectionRow[],
  connectors: ConnectorRow[],
  documents: DocumentRow[],
  orgNames: Record<string, string>,
  actual: ActualCounts | null,
  /**
   * Each org's own ceiling, keyed by org id. A missing entry means "no override",
   * which is the same thing the enforcement path does — so the admin reports the
   * number that will actually refuse the customer, not a fourth guess.
   */
  quotaByOrg: Record<string, number | null | undefined> = {},
  defaultQuota = DEFAULT_VECTOR_QUOTA
): OrgRag[] {
  const connByCollection = new Map<string, string[]>();
  for (const c of connectors) {
    if (!c.collection_id) continue;
    const list = connByCollection.get(c.collection_id);
    if (list) list.push(c.id);
    else connByCollection.set(c.collection_id, [c.id]);
  }

  const failedByConnector = new Map<string, number>();
  for (const d of documents) {
    if ((d.status ?? "") !== "failed") continue;
    failedByConnector.set(d.connector_id, (failedByConnector.get(d.connector_id) ?? 0) + 1);
  }

  const byOrg = new Map<string, { cols: CollectionRow[]; conns: ConnectorRow[] }>();
  for (const c of collections) {
    const e = byOrg.get(c.org_id) ?? { cols: [], conns: [] };
    e.cols.push(c);
    byOrg.set(c.org_id, e);
  }
  for (const c of connectors) {
    const e = byOrg.get(c.org_id) ?? { cols: [], conns: [] };
    e.conns.push(c);
    byOrg.set(c.org_id, e);
  }

  const out: OrgRag[] = [];
  for (const [orgId, { cols, conns }] of byOrg) {
    // `Number(null)` is 0, NOT NaN — so coercing first would turn "no override"
    // (the normal case for every org) into a quota of ZERO and report every
    // customer as full. Caught live 2026-08-04. Check for absence FIRST.
    const raw = quotaByOrg[orgId];
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    const quota = Number.isFinite(n) && n >= 0 ? n : defaultQuota;
    const views: CollectionView[] = cols.map((c) => {
      const counted = Number(c.row_count) || 0;
      const act = actual ? actual[c.id] ?? 0 : null;
      return {
        ...c,
        counted,
        actual: act,
        drift: act === null ? null : act - counted,
        connector_ids: connByCollection.get(c.id) ?? [],
        empty: counted === 0 && (act === null || act === 0),
      };
    });

    const used = views.reduce((n, v) => n + v.counted, 0);
    const actualTotal = actual ? views.reduce((n, v) => n + (v.actual ?? 0), 0) : null;
    const failedDocs = conns.reduce((n, c) => n + (failedByConnector.get(c.id) ?? 0), 0);

    out.push({
      org_id: orgId,
      org_name: orgNames[orgId] ?? "(unknown org)",
      collections: views.sort((a, b) => b.counted - a.counted),
      vectors_used: used,
      vectors_actual: actualTotal,
      quota,
      quota_pct: quota > 0 ? (used / quota) * 100 : 100,
      quota_state: quotaState(used, quota),
      drift: actualTotal === null ? null : actualTotal - used,
      size_bytes: views.reduce((n, v) => n + (Number(v.size_bytes) || 0), 0),
      connectors: conns,
      broken_connectors: conns.filter((c) => (c.status ?? "") === "error").length,
      failed_documents: failedDocs,
      empty_collections: views.filter((v) => v.empty).length,
      embedding_models: [...new Set(views.map((v) => v.embedding_model_id).filter(Boolean) as string[])],
    });
  }
  return out;
}

export interface RagSummary {
  orgs: number;
  collections: number;
  vectors_used: number;
  vectors_actual: number | null;
  /** Orgs at or above 90% of quota. */
  orgs_near_quota: number;
  orgs_full: number;
  broken_connectors: number;
  failed_documents: number;
  empty_collections: number;
  /** Collections whose cached count disagrees with reality. */
  drifted_collections: number;
  total_drift: number | null;
  size_bytes: number;
  /** Collections whose embedding model no longer matches their org's others. */
  mixed_model_orgs: number;
}

export function summarize(orgs: OrgRag[]): RagSummary {
  let collections = 0, used = 0, actual: number | null = 0, near = 0, full = 0;
  let broken = 0, failedDocs = 0, empty = 0, drifted = 0, drift: number | null = 0, size = 0, mixed = 0;

  for (const o of orgs) {
    collections += o.collections.length;
    used += o.vectors_used;
    if (o.vectors_actual === null) actual = null;
    else if (actual !== null) actual += o.vectors_actual;
    if (o.quota_state === "near") near++;
    if (o.quota_state === "full") full++;
    broken += o.broken_connectors;
    failedDocs += o.failed_documents;
    empty += o.empty_collections;
    size += o.size_bytes;
    if (o.embedding_models.length > 1) mixed++;
    for (const c of o.collections) {
      if (c.drift !== null && c.drift !== 0) {
        drifted++;
        if (drift !== null) drift += c.drift;
      }
    }
    if (o.drift === null) drift = null;
  }

  return {
    orgs: orgs.length,
    collections,
    vectors_used: used,
    vectors_actual: actual,
    orgs_near_quota: near,
    orgs_full: full,
    broken_connectors: broken,
    failed_documents: failedDocs,
    empty_collections: empty,
    drifted_collections: drifted,
    total_drift: drift,
    size_bytes: size,
    mixed_model_orgs: mixed,
  };
}

/** Worst-first: quota pressure and broken ingestion before idle orgs. */
export function sortByRisk(orgs: OrgRag[]): OrgRag[] {
  const rank = (o: OrgRag) =>
    o.quota_state === "full" ? 0
    : o.broken_connectors > 0 ? 1
    : o.quota_state === "near" ? 2
    : o.failed_documents > 0 ? 3
    : o.quota_state === "watch" ? 4
    : o.vectors_used > 0 ? 5
    : 6;
  return [...orgs].sort(
    (a, b) => rank(a) - rank(b) || b.vectors_used - a.vectors_used || a.org_name.localeCompare(b.org_name)
  );
}

/** Human bytes, for a column that would otherwise show raw integers. */
export function humanBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// ── Billing integrity ────────────────────────────────────────────────────────
//
// A collection is a billed resource: creating one inserts a row into
// `billing.active_inference_vector`, and deleting one is supposed to close it.
// The delete route does call `closeActiveBilling`, but a failure there is
// swallowed into a `console.warn` — so the collection goes, the meter stays, and
// the only record is a log line nobody reads.
//
// Found live 2026-08-05: 20 active enrolments against 11 collections. Eleven of
// them billed $8/month each for collections that no longer existed, and two
// collections stored vectors with no enrolment at all. Money leaking in BOTH
// directions, invisible because this page loaded collections and never the
// meters beside them.
//
// This is the reconciliation. It is pure set arithmetic over the two lists — the
// hard part was never the logic, it was that nobody was comparing them.

/** One row of `billing.active_inference_vector`. */
export interface VectorBillingRow {
  service_id: string;
  user_id: string | null;
  hourly_rate: number | string | null;
  status: string | null;
}

export type BillingIssueKind =
  /** Billed, but the collection is gone — the customer is paying for nothing. */
  | "orphaned_meter"
  /** The collection exists and stores vectors, but nothing meters it. */
  | "unbilled_collection";

export interface BillingIssue {
  kind: BillingIssueKind;
  /** Collection id — the `service_id` for a meter, the row id for a collection. */
  id: string;
  org_id: string | null;
  org_name: string | null;
  /** Collection name, when we still have one. An orphan by definition does not. */
  name: string | null;
  /** Monthly cost of an orphan, or the un-metered revenue of an unbilled one. */
  monthly_cents: number | null;
  detail: string;
}

/** Hourly rates arrive as NUMERIC — a string over the wire. Never coerce blindly. */
function hourlyToMonthlyCents(rate: number | string | null): number | null {
  if (rate === null || rate === undefined) return null;
  const n = Number(rate);
  if (!Number.isFinite(n)) return null;
  // The `active_*` tables store dollars per hour; 720h is the platform's
  // month, matching bill_service_cycle_atomic.
  return Math.round(n * 720 * 100);
}

/**
 * Compare the meters against the collections.
 *
 * Only `status='active'` meters count as orphans: a closed row is history, not
 * a live charge, and flagging it would bury the real ones.
 */
export function findBillingIssues(
  collections: Array<Pick<CollectionRow, "id" | "name" | "org_id" | "row_count">>,
  meters: VectorBillingRow[],
  orgNames: Record<string, string> = {}
): BillingIssue[] {
  const liveCollections = new Map(collections.map((c) => [c.id, c]));
  const activeMeters = meters.filter((m) => (m.status ?? "active") === "active");
  const meteredIds = new Set(activeMeters.map((m) => m.service_id));

  const issues: BillingIssue[] = [];

  for (const m of activeMeters) {
    if (liveCollections.has(m.service_id)) continue;
    const monthly = hourlyToMonthlyCents(m.hourly_rate);
    issues.push({
      kind: "orphaned_meter",
      id: m.service_id,
      org_id: null, // the meter is keyed by payer, not org — the collection is gone
      org_name: null,
      name: null,
      monthly_cents: monthly,
      detail:
        `Still billing${monthly === null ? "" : ` $${(monthly / 100).toFixed(2)}/month`}` +
        ` for a collection that no longer exists. Closing the meter stops the charge.`,
    });
  }

  for (const c of collections) {
    if (meteredIds.has(c.id)) continue;
    issues.push({
      kind: "unbilled_collection",
      id: c.id,
      org_id: c.org_id,
      org_name: orgNames[c.org_id] ?? null,
      name: c.name,
      monthly_cents: null,
      detail:
        `Stores ${c.row_count ?? 0} vector(s) with no billing meter, so its storage is free. ` +
        `Usually means the meter failed to register when the collection was created.`,
    });
  }

  // Money being wrongly charged outranks money not being charged: one is a
  // refund conversation with a customer, the other is our own revenue.
  const rank = (k: BillingIssueKind) => (k === "orphaned_meter" ? 0 : 1);
  return issues.sort(
    (a, b) => rank(a.kind) - rank(b.kind) || (b.monthly_cents ?? 0) - (a.monthly_cents ?? 0)
  );
}

export interface BillingIntegrity {
  checked: boolean;
  /** Null when the billing table could not be read — never silently "0 issues". */
  error: string | null;
  meters_active: number;
  collections: number;
  orphaned_meters: number;
  unbilled_collections: number;
  /** Total being charged for collections that do not exist. */
  wrongly_charged_monthly_cents: number;
  issues: BillingIssue[];
}

export function summarizeBillingIntegrity(
  collections: Array<Pick<CollectionRow, "id" | "name" | "org_id" | "row_count">>,
  meters: VectorBillingRow[] | null,
  orgNames: Record<string, string> = {},
  error: string | null = null
): BillingIntegrity {
  if (meters === null || error) {
    return {
      checked: false,
      error: error ?? "billing.active_inference_vector could not be read",
      meters_active: 0,
      collections: collections.length,
      orphaned_meters: 0,
      unbilled_collections: 0,
      wrongly_charged_monthly_cents: 0,
      issues: [],
    };
  }
  const issues = findBillingIssues(collections, meters, orgNames);
  const orphans = issues.filter((i) => i.kind === "orphaned_meter");
  return {
    checked: true,
    error: null,
    meters_active: meters.filter((m) => (m.status ?? "active") === "active").length,
    collections: collections.length,
    orphaned_meters: orphans.length,
    unbilled_collections: issues.length - orphans.length,
    wrongly_charged_monthly_cents: orphans.reduce((n, i) => n + (i.monthly_cents ?? 0), 0),
    issues,
  };
}
