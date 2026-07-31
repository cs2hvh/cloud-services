/**
 * AI platform overview — "what is used, and what is broken?" Pure, DB-free, UI-free.
 *
 * The admin grew one page per subsystem: pricing, orgs, usage, audit, agents,
 * workers, vector storage, observability. Each answers its own question well and
 * none answers the two an operator asks first:
 *
 *   - which AI features are customers actually using?
 *   - is anything broken right now?
 *
 * Today that means opening eight pages and assembling the answer by hand. This
 * module turns it into one row per capability.
 *
 * WHY A DECLARATIVE REGISTRY: the 13 capabilities live in 13 different tables with
 * different status vocabularies, different time columns and different notions of
 * failure. Writing that as 13 bespoke queries guarantees they drift. Here each
 * capability declares where its rows are and what "failed" means for it, and one
 * generic counter walks the list — the same discipline as runner-registry.ts, and
 * for the same reason (that file's four wrong status values were only caught by
 * checking them against the schema).
 *
 * EVERY COUNT IS AN EXACT DATABASE COUNT, never a fetched-and-measured array.
 * PostgREST caps a response at 1,000 rows without erroring, so counting client
 * side would silently plateau — `billing.transactions` proved that at 149,905 rows.
 */

export type Verdict =
  | "healthy"    // used and not failing
  | "degraded"   // used, but failing above tolerance
  | "idle"       // built and configured, but nothing has happened lately
  | "unused"     // no rows at all — shipped and never adopted
  | "unknown";   // could not be measured

/** How one AI capability is measured. */
export interface CapabilitySpec {
  /** Stable key, used by the UI. */
  key: string;
  label: string;
  /** What the customer gets, in one line. */
  purpose: string;
  schema: "inference" | "agentcore";
  /** Table whose rows represent usage of this capability. */
  table: string;
  /** Column to date rows by, for "recent" and "last activity". */
  time_column: string;
  /** Column identifying the customer, for adoption counts. Null when not org-scoped. */
  org_column: string | null;
  /**
   * Statuses that mean this capability FAILED for a customer. Empty when the table
   * has no status concept — then failures cannot be counted and are reported null,
   * not zero.
   */
  failure_statuses: string[];
  /** Status column name, when the table has one. */
  status_column: string | null;
  /** Which admin page manages this, so a row can link to it. */
  admin_path: string | null;
  /** Error rate above which the capability is called degraded, as a percentage. */
  degraded_above_pct: number;
}

/**
 * The 13 capabilities, each cited to the table that proves it.
 *
 * Statuses are taken from the migrations, matching runner-registry.ts — note
 * `media_jobs` uses the ONE-L `canceled` while everything else uses `cancelled`.
 */
export const CAPABILITIES: CapabilitySpec[] = [
  {
    key: "inference",
    label: "Inference (chat, embeddings, media)",
    purpose: "The metered /v1 surface — every token and unit customers buy",
    schema: "inference",
    table: "usage",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    // inference.usage_status ENUM (20260523000001): success | error_upstream |
    // error_rate_limit | error_budget | error_auth | error_validation |
    // error_internal | cancelled. An earlier draft guessed 'error'/'failed', which
    // do not exist — Postgres rejected the whole IN() with a 400 and the failure
    // count silently became "unmeasurable" for the platform's busiest capability.
    failure_statuses: [
      "error_upstream",
      "error_rate_limit",
      "error_budget",
      "error_auth",
      "error_validation",
      "error_internal",
    ],
    admin_path: "/dashboard/admin/inference-usage",
    degraded_above_pct: 5,
  },
  {
    key: "vectors",
    label: "Vector collections (RAG)",
    purpose: "Managed embeddings customers search against",
    schema: "inference",
    table: "vector_collections",
    time_column: "updated_at",
    org_column: "org_id",
    status_column: null, // a collection has no status; emptiness is handled by the RAG page
    failure_statuses: [],
    admin_path: "/dashboard/admin/inference-rag",
    degraded_above_pct: 100,
  },
  {
    key: "connectors",
    label: "RAG connectors",
    purpose: "Automatic ingestion from S3 buckets and web crawls",
    schema: "inference",
    table: "connectors",
    time_column: "updated_at",
    org_column: "org_id",
    status_column: "status",
    failure_statuses: ["error"],
    admin_path: "/dashboard/admin/inference-rag",
    degraded_above_pct: 20,
  },
  {
    key: "agents",
    label: "Agents",
    purpose: "Durable multi-step agent runs with tools and sandboxes",
    schema: "agentcore",
    table: "runs",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    failure_statuses: ["failed", "cancelled"],
    admin_path: "/dashboard/admin/inference-agents",
    degraded_above_pct: 20,
  },
  {
    key: "evals",
    label: "Evals",
    purpose: "Scored test suites over a model or prompt",
    schema: "inference",
    table: "eval_runs",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    failure_statuses: ["failed", "cancelled"],
    admin_path: null,
    degraded_above_pct: 20,
  },
  {
    key: "finetunes",
    label: "Fine-tuning",
    purpose: "Customer-trained adapters on rented GPUs",
    schema: "inference",
    table: "finetunes",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    failure_statuses: ["failed", "cancelled"],
    admin_path: "/dashboard/admin/inference-workers",
    degraded_above_pct: 25,
  },
  {
    key: "deployments",
    label: "BYO deployments",
    purpose: "Dedicated serving endpoints for a customer's own model",
    schema: "inference",
    table: "deployments",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    failure_statuses: ["failed"],
    admin_path: "/dashboard/admin/inference-workers",
    degraded_above_pct: 25,
  },
  {
    key: "media_jobs",
    label: "Media generation jobs",
    purpose: "Async image, video, speech and OCR work",
    schema: "inference",
    table: "media_jobs",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    // One-L 'canceled' per the CHECK constraint in 20260623000001.
    failure_statuses: ["failed", "canceled"],
    admin_path: "/dashboard/admin/inference-workers",
    degraded_above_pct: 20,
  },
  {
    key: "batches",
    label: "Batch jobs",
    purpose: "Discounted bulk inference over a file",
    schema: "inference",
    table: "batches",
    time_column: "created_at",
    org_column: "org_id",
    status_column: "status",
    // inference.batch_status ENUM (20260526000002): validating | failed |
    // in_progress | finalizing | completed | expired | cancelling | cancelled.
    failure_statuses: ["failed", "expired", "cancelled"],
    admin_path: null,
    degraded_above_pct: 20,
  },
  {
    key: "files",
    label: "File storage",
    purpose: "Uploads backing batches, fine-tunes and RAG",
    schema: "inference",
    table: "files",
    time_column: "created_at",
    org_column: "org_id",
    status_column: null,
    failure_statuses: [],
    admin_path: null,
    degraded_above_pct: 100,
  },
  {
    key: "prompts",
    label: "Prompt management",
    purpose: "Versioned prompts customers call by name",
    schema: "inference",
    table: "prompts",
    time_column: "created_at",
    org_column: "org_id",
    status_column: null,
    failure_statuses: [],
    admin_path: null,
    degraded_above_pct: 100,
  },
  {
    key: "guardrails",
    label: "Guardrail policies",
    purpose: "Per-org content rules applied to requests",
    schema: "inference",
    table: "guardrail_policies",
    time_column: "created_at",
    org_column: "org_id",
    status_column: null,
    failure_statuses: [],
    admin_path: "/dashboard/admin/inference-traces",
    degraded_above_pct: 100,
  },
  {
    key: "byok",
    label: "BYOK provider keys",
    purpose: "Customers billing upstream on their own provider accounts",
    schema: "inference",
    table: "byok_keys",
    time_column: "created_at",
    org_column: "org_id",
    status_column: null,
    failure_statuses: [],
    admin_path: null,
    degraded_above_pct: 100,
  },
];

/** Raw measurements for one capability. Nulls mean "not measurable", never zero. */
export interface CapabilityCounts {
  key: string;
  /** Rows ever. */
  total: number | null;
  /** Rows inside the window. */
  recent: number | null;
  /**
   * Failed rows inside the window. Null means NOT MEASURABLE — either the table
   * has no status concept, or the count query itself failed. Those are different
   * problems, so `failure_error` carries the second one instead of it vanishing.
   */
  failures: number | null;
  /** Set when the failure count could not be taken, e.g. a bad status value. */
  failure_error: string | null;
  /** Distinct customers inside the window, or null when not org-scoped/not sampled. */
  orgs: number | null;
  /** Newest row's timestamp, any age. */
  last_activity: string | null;
  /** Set when the table could not be read at all. */
  error: string | null;
}

/** True when a capability HAS a status concept, so failures should be countable. */
export function shouldMeasureFailures(spec: CapabilitySpec): boolean {
  return !!spec.status_column && spec.failure_statuses.length > 0;
}

export interface CapabilityHealth extends CapabilityCounts {
  label: string;
  purpose: string;
  source: string;
  admin_path: string | null;
  verdict: Verdict;
  /** Failure percentage over the window, or null when failures are unmeasurable. */
  error_rate_pct: number | null;
  /** Plain-language reason, so the UI never has to infer one. */
  detail: string;
  /** Days since the newest row, or null when there has never been one. */
  idle_days: number | null;
}

/** Anything quieter than this is "idle" rather than healthy. */
export const IDLE_AFTER_DAYS = 30;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/**
 * Judge one capability.
 *
 * Precedence is deliberate: unmeasurable beats everything (never guess), then
 * never-adopted, then failing, then quiet. "unused" and "idle" are NOT failures —
 * a feature nobody has tried is a product fact, not an outage, and painting it red
 * teaches an operator to ignore the page.
 */
export function judge(spec: CapabilitySpec, counts: CapabilityCounts, now: number): CapabilityHealth {
  const source = `${spec.schema}.${spec.table}`;
  const idle = daysSince(counts.last_activity, now);
  const rate =
    counts.failures === null || !counts.recent ? null : (counts.failures / counts.recent) * 100;

  let verdict: Verdict;
  let detail: string;

  if (counts.error) {
    verdict = "unknown";
    detail = `Could not read ${source}: ${counts.error}`;
  } else if ((counts.total ?? 0) === 0) {
    verdict = "unused";
    detail = "Shipped, but no customer has ever used it.";
  } else if (rate !== null && rate > spec.degraded_above_pct) {
    verdict = "degraded";
    detail = `${counts.failures} of ${counts.recent} failed in the window (${rate.toFixed(0)}%), above the ${spec.degraded_above_pct}% tolerance.`;
  } else if ((counts.recent ?? 0) === 0) {
    verdict = "idle";
    detail =
      idle === null
        ? "Has rows, but none in the window."
        : `Nothing in the window; last activity ${idle} day(s) ago.`;
  } else if (counts.failure_error) {
    //活 A capability that SHOULD report failures but cannot is not "healthy" —
    // we simply do not know whether it is failing.
    verdict = "unknown";
    detail = `Could not count failures for ${source}: ${counts.failure_error}`;
  } else {
    verdict = "healthy";
    const who = counts.orgs === null ? "" : ` across ${counts.orgs} customer(s)`;
    detail =
      rate === null
        ? `${counts.recent} in the window${who}. This table has no status column, so failures cannot be counted.`
        : `${counts.recent} in the window${who}, ${rate.toFixed(1)}% failing.`;
  }

  return {
    ...counts,
    label: spec.label,
    purpose: spec.purpose,
    source,
    admin_path: spec.admin_path,
    verdict,
    error_rate_pct: rate,
    detail,
    idle_days: idle,
  };
}

export interface PlatformSummary {
  capabilities: number;
  healthy: number;
  degraded: number;
  idle: number;
  unused: number;
  unknown: number;
  /** Total rows created in the window across every capability. */
  recent_activity: number;
  /** Capabilities with no admin page at all. */
  unmanaged: number;
  /** Capabilities whose failures cannot be measured because the table has no status. */
  unmeasurable_failures: number;
}

export function summarize(rows: CapabilityHealth[]): PlatformSummary {
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return {
    capabilities: rows.length,
    healthy: count("healthy"),
    degraded: count("degraded"),
    idle: count("idle"),
    unused: count("unused"),
    unknown: count("unknown"),
    recent_activity: rows.reduce((n, r) => n + (r.recent ?? 0), 0),
    unmanaged: rows.filter((r) => !r.admin_path).length,
    unmeasurable_failures: rows.filter((r) => r.failures === null && (r.total ?? 0) > 0).length,
  };
}

/** Most-used first — the direct answer to "what do customers actually use?" */
export function sortByUsage(rows: CapabilityHealth[]): CapabilityHealth[] {
  return [...rows].sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0) || (b.total ?? 0) - (a.total ?? 0));
}

/** Worst-first, for the "is anything broken?" reading of the same table. */
export function sortByConcern(rows: CapabilityHealth[]): CapabilityHealth[] {
  const rank: Record<Verdict, number> = { degraded: 0, unknown: 1, idle: 2, healthy: 3, unused: 4 };
  return [...rows].sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || (b.error_rate_pct ?? 0) - (a.error_rate_pct ?? 0)
  );
}
