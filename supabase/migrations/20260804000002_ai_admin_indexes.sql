-- Indexes for the platform-wide AI admin reads.
--
-- ⚠ PARTLY SUPERSEDED — see 20260804000003. The paragraph below about
-- `inference.audit_log` gives a WRONG rationale: it treats partitioning as a
-- reason to skip that table, without noticing that `inference.usage` and
-- `inference.trace_spans` are partitioned exactly the same way. The three
-- indexes this file creates are correct and stay; the follow-up migration adds
-- the audit_log one and explains what an index actually buys on a partitioned
-- table (it serves the ORDER BY; pruning serves the filter).
--
-- WHY THESE EXIST: every index on the AI tables was built for the CUSTOMER path
-- and leads with `org_id` — `idx_usage_org_time (org_id, created_at DESC)`,
-- `idx_trace_spans_org_time`, `idx_agentcore_runs_org`. The admin console asks a
-- different question: "everything on the platform, in this time window, newest
-- first". A leading-`org_id` index cannot serve
--
--     WHERE created_at >= $1 ORDER BY created_at DESC
--
-- because the rows it wants are scattered across every org's section of the
-- index. So these three reads have NO usable index at all and fall back to a
-- sequential scan plus a sort, on every admin page load.
--
-- The queries, verbatim from the routes:
--   app/api/admin/inference/usage/route.ts   → usage        .gte(created_at).order(created_at desc).limit(20000)
--   app/api/admin/inference/traces/route.ts  → trace_spans  .gte(created_at).order(created_at desc).range(...)
--   app/api/admin/inference/jobs/route.ts    → agentcore.runs .order(created_at desc).range(...)
--   plus lib/admin/feature-health.ts, which takes a windowed count and a
--   newest-row lookup against the same columns for all three.
--
-- WHY ONLY THREE. Measured 2026-08-04, every AI table is small: usage 2,042 rows,
-- trace_spans 1,579, agentcore.runs 330, and then it falls off a cliff —
-- media_jobs 33, finetunes 27, eval_runs 14, connectors 2, deployments 0.
-- Indexing a 30-row table is not an optimisation, it is write overhead and a
-- maintenance burden for a scan Postgres does in microseconds; the planner would
-- ignore the index anyway. So the small tables get NOTHING, deliberately, and
-- this migration covers only the three that grow with traffic:
--
--   inference.usage      — one row per billable customer request
--   inference.trace_spans — one row per traced span
--   agentcore.runs       — one row per agent run
--
-- These are also the reason to act NOW rather than when it hurts: adding an index
-- to a busy, large table is a far worse operation than adding it while the table
-- is small. At today's sizes each build takes milliseconds.
--
-- `inference.audit_log` is deliberately absent. It is PARTITIONED BY RANGE
-- (created_at), so a `created_at >= $1` filter is already served by partition
-- pruning — Postgres skips whole partitions rather than scanning them — which
-- beats an index and costs nothing to maintain. (It is also why CONCURRENTLY
-- could not be used there: Postgres does not support it on partitioned tables.)
--
-- ⚠ THE PARAGRAPH ABOVE IS WRONG and is kept only because this migration has
-- already been applied. `usage` and `trace_spans` are partitioned identically,
-- so partitioning cannot be a reason to treat audit_log differently; and pruning
-- serves the FILTER, not the ORDER BY, which is what these paged reads need.
-- Corrected in 20260804000003.
--
-- NOTE ON LOCKING: plain CREATE INDEX takes a brief ACCESS EXCLUSIVE lock, which
-- at these row counts is milliseconds. If these tables have grown large before
-- this migration is applied, convert them to CREATE INDEX CONCURRENTLY and run
-- the file OUTSIDE a transaction — concurrently cannot run inside one.

-- ── inference.usage ──────────────────────────────────────────────────────────
-- Serves the usage explorer's window scan, and feature-health's "rows in window"
-- count + "last activity" lookup for the platform's busiest capability.
CREATE INDEX IF NOT EXISTS idx_usage_created_at
  ON inference.usage (created_at DESC);

COMMENT ON INDEX inference.idx_usage_created_at IS
  'Platform-wide time-range reads for the admin console. The org-scoped indexes cannot serve these: they lead with org_id, so an unfiltered ORDER BY created_at cannot walk them in order.';

-- ── inference.trace_spans ────────────────────────────────────────────────────
-- The observability page pages through a window with an exact count; percentiles
-- are only meaningful over the whole window, so it really does read every row in
-- range rather than a capped sample.
CREATE INDEX IF NOT EXISTS idx_trace_spans_created_at
  ON inference.trace_spans (created_at DESC);

COMMENT ON INDEX inference.idx_trace_spans_created_at IS
  'Platform-wide windowed paging for /dashboard/admin/inference-traces.';

-- ── agentcore.runs ───────────────────────────────────────────────────────────
-- The AI Jobs page orders every run newest-first across all customers and pages
-- through them. `idx_agentcore_runs_claim` is partial (status IN queued/running)
-- so it cannot serve the completed/failed/all views, and `idx_agentcore_runs_org`
-- leads with org_id.
CREATE INDEX IF NOT EXISTS idx_agentcore_runs_created_at
  ON agentcore.runs (created_at DESC);

COMMENT ON INDEX agentcore.idx_agentcore_runs_created_at IS
  'Platform-wide newest-first paging for /dashboard/admin/inference-jobs. The existing claim index is partial and the org index leads with org_id.';
