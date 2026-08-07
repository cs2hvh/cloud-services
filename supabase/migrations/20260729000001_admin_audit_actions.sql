-- Admin audit: record who changed prices, limits and keys.
-- Doc: nextstespsAI/21-admin-platform.md (§5.2 — "audit every admin mutation
-- from day one, or the audit section in A6 ships with a hole").
--
-- The admin sections built on 2026-07-28/29 (A1 pricing, A2 orgs, A3 usage)
-- expose four write paths — reprice a model, bulk-reprice the catalog, change
-- an org's spend cap, revoke or reflag an API key — and none of them could be
-- recorded, because `inference.audit_log` had no vocabulary for them. A bulk
-- reprice of 21 models on 2026-07-28 left no trace of who ran it or what the
-- prices were before. This migration makes that recordable.
--
-- Three changes, each independent:

-- ── 1. Platform-scoped actions need a NULL org ───────────────────────────────
--
-- audit_log.org_id was NOT NULL because every action so far belonged to a
-- customer. An admin repricing `openai/gpt-4o` acts on the CATALOG — it belongs
-- to no org, and inventing one (a sentinel uuid, or the admin's own org) would
-- put a platform action inside a customer's audit trail.
--
-- Making it nullable is also the access-control we want: the customer-facing
-- audit view filters by org via inference.is_org_member(org_id), and a NULL
-- org_id matches no member, so admin rows are invisible to customers by
-- construction rather than by a WHERE clause someone must remember to write.
ALTER TABLE inference.audit_log ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN inference.audit_log.org_id IS
  'Owning org, or NULL for a platform-scoped admin action (catalog pricing, model activation). NULL rows are invisible to org-scoped RLS reads by design.';

-- ── 2. Vocabulary for admin mutations ────────────────────────────────────────
--
-- Named for what an operator did, not which table moved, so the audit view
-- reads as a story. `admin.` prefix keeps them sorted away from customer
-- actions and makes "show me everything staff did" a prefix match.
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.model_price_updated';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.model_bulk_repriced';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.model_activation_changed';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.org_limits_updated';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.key_updated';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'admin.key_revoked';

-- ── 3. Stop the partition cliff ──────────────────────────────────────────────
--
-- audit_log is PARTITIONED BY RANGE (created_at) and partitions were only
-- created through 2026-12. There is no job that adds more, and lib/inference/
-- audit.ts swallows write errors by design (an audit failure must not break a
-- customer request) — so from 2027-01-01 every audit write would have failed
-- SILENTLY. Twelve more months buys time; a scheduled partition job is the real
-- fix and is not in scope here.
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m01 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m02 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m03 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m04 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m05 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m06 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m07 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m08 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m09 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m10 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m11 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS inference.audit_log_y2027m12 PARTITION OF inference.audit_log FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- NOTE: `ALTER TYPE ... ADD VALUE` cannot be used by a statement in the SAME
-- transaction that adds it. The application reads these values in later
-- transactions, so nothing here depends on that ordering.
