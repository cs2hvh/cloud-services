-- Corrects and completes 20260804000002.
--
-- THE ERROR IN THE PREVIOUS MIGRATION. It excluded `inference.audit_log` on the
-- grounds that the table is PARTITIONED BY RANGE (created_at), so partition
-- pruning already serves a `created_at >= $1` filter and "beats an index".
--
-- That reasoning was wrong twice over, and it was caught by a failing insert
-- during post-migration testing that revealed the partition name `usage_y2026m08`:
--
--   1. **`inference.usage` and `inference.trace_spans` are partitioned the same
--      way.** All three tables are PARTITIONED BY RANGE (created_at) —
--      20260523000001 for usage, 20260625000001 for trace_spans. The previous
--      migration used partitioning as a reason to SKIP one table while indexing
--      two others that share the property. Whatever the right answer is, it is
--      the same answer for all three.
--
--   2. **Pruning and the index do different jobs.** Pruning narrows the FILTER —
--      it skips partitions outside the window. It does nothing for the ORDER BY.
--      Without a per-partition index on `created_at`, `ORDER BY created_at DESC`
--      over the surviving partitions is an Append followed by a Sort of every
--      matching row. With one, the planner can MergeAppend the already-ordered
--      partitions and stop as soon as the page is filled — which is what these
--      paged admin reads actually want. So the index earns its place on a
--      partitioned table for ordering, not for filtering.
--
-- Both indexes created by 20260804000002 are therefore still correct and stay.
-- What was missing is the third table, added below, so all three reads of the
-- same shape are treated the same way:
--
--   app/api/admin/inference/audit/route.ts
--     .gte(created_at, since).order(created_at desc)  → paged to ROW_LIMIT
--
-- WHY AUDIT_LOG BELONGS HERE. It grows without bound — a row per customer action
-- plus one per admin mutation, and the admin write paths added on 2026-08-04
-- (job retry/cancel, feature switches, quota changes) only increase that rate.
-- It is small today (400 rows, 279 in a 30-day window), which is precisely why
-- this is the cheap moment to add the index rather than a later one.
--
-- NOTE ON PARTITIONED INDEXES: `CREATE INDEX` on a partitioned table creates a
-- partitioned index and cascades to every existing partition, which is what we
-- want — including the 2027 partitions added by 20260729000001. New partitions
-- created later inherit it automatically. `CONCURRENTLY` is NOT supported on a
-- partitioned table, so this takes a brief lock per partition; at these row
-- counts that is milliseconds.

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON inference.audit_log (created_at DESC);

COMMENT ON INDEX inference.idx_audit_log_created_at IS
  'Platform-wide newest-first paging for /dashboard/admin/inference-audit. Partition pruning already narrows the created_at FILTER; this serves the ORDER BY, letting the planner MergeAppend ordered partitions instead of sorting the window.';
