-- Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§5, Slice C0)
--
-- RAG connectors: a saved, credentialed link from a knowledge base (an
-- inference.vector_collections row) to a source of documents (an S3 bucket or
-- a website to crawl), plus a per-document sync ledger that drives incremental
-- sync (content-hash / ETag skip + tombstone deletion, §6). The data-runner
-- (workers/data-runner) claims queued connectors and syncs them out of band;
-- nothing here runs inline on a request.
--
-- Style mirrors agentcore.mcp_servers (20260707000002) — the closest analog:
-- an org-scoped inference table with an AES-256-GCM-encrypted credential in a
-- BYTEA column (lib/inference/crypto.ts), RLS via inference.is_org_member, the
-- shared public.gpu_set_updated_at() trigger, and audit_action enum values for
-- the CRUD route (C1).

-- ── Connectors: one saved source per row ────────────────────────────────────
CREATE TABLE IF NOT EXISTS inference.connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  collection_id   UUID NOT NULL REFERENCES inference.vector_collections(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('s3', 'web_crawl')),  -- extend later: 'gdrive','notion'
  display_name    TEXT NOT NULL,
  -- Non-secret config: S3 { bucket, region, endpoint?, prefix? } |
  -- web_crawl { seed_url, max_pages, max_depth }. max_documents caps a sync.
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Encrypted source credential (AES-256-GCM, lib/inference/crypto.ts + BYOK_DEK).
  -- NULL for web_crawl (public pages need no credential). Never returned by any
  -- read path — masked to has_credential:true.
  credential_enc  BYTEA,
  -- Optional: POST a signed connector.sync.completed/failed event here on settle.
  webhook_url     TEXT,
  sync_schedule   TEXT NOT NULL DEFAULT 'manual'
                  CHECK (sync_schedule IN ('manual', 'hourly', 'daily')),
  status          TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle', 'queued', 'syncing', 'error', 'disabled')),
  last_error      TEXT,                              -- customer-safe (customerSafeErrorMessage)
  last_synced_at  TIMESTAMPTZ,
  next_sync_at    TIMESTAMPTZ,                       -- scheduler enqueues once now() >= this
  claimed_by      TEXT,                              -- runner pod id (claim pattern)
  heartbeat_at    TIMESTAMPTZ,                       -- ingest-watchdog reaps a stuck sync
  -- Rollup counters from the last completed sync (for the dashboard + webhook).
  docs_total      INTEGER NOT NULL DEFAULT 0,
  docs_added      INTEGER NOT NULL DEFAULT 0,
  docs_updated    INTEGER NOT NULL DEFAULT 0,
  docs_removed    INTEGER NOT NULL DEFAULT 0,
  docs_failed     INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, display_name)
);

-- Scheduler reads this: scheduled (non-manual) connectors whose next_sync_at
-- has passed and that aren't already in flight.
CREATE INDEX IF NOT EXISTS idx_connectors_due
  ON inference.connectors (next_sync_at)
  WHERE status IN ('idle', 'error') AND sync_schedule <> 'manual';
-- Runner claimer reads this: queued connectors, oldest next_sync_at first.
CREATE INDEX IF NOT EXISTS idx_connectors_claim
  ON inference.connectors (status, next_sync_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_connectors_collection
  ON inference.connectors (collection_id);

DROP TRIGGER IF EXISTS set_connectors_updated_at ON inference.connectors;
CREATE TRIGGER set_connectors_updated_at
  BEFORE UPDATE ON inference.connectors
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- ── Per-document sync ledger: the incremental-sync key ──────────────────────
-- One row per source document ever seen, per connector. content_sha256 is the
-- change-detection key; row_external_ids ties a source doc to the vector_rows
-- it produced, so a deletion/tombstone can remove exactly those rows (§6).
-- org_id is denormalized (like agentcore.run_steps) so RLS needs no join.
CREATE TABLE IF NOT EXISTS inference.connector_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id     UUID NOT NULL REFERENCES inference.connectors(id) ON DELETE CASCADE,
  collection_id    UUID NOT NULL REFERENCES inference.vector_collections(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL,                    -- denormalized for RLS (no join)
  source_uri       TEXT NOT NULL,                    -- s3://bucket/key | https://site/page
  content_sha256   TEXT,                             -- of the extracted text; NULL until first ingest
  source_etag      TEXT,                             -- S3 ETag / HTTP ETag — a cheap pre-hash skip
  row_external_ids TEXT[] NOT NULL DEFAULT '{}',     -- the vector_rows.external_id this doc owns
  chunk_count      INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'indexed', 'failed', 'removed')),
  error            TEXT,                             -- customer-safe per-doc failure reason
  last_seen_sync   UUID,                             -- the sync run id that last saw this doc (tombstone key)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connector_id, source_uri)
);

CREATE INDEX IF NOT EXISTS idx_connector_documents_conn
  ON inference.connector_documents (connector_id);
-- Tombstone reconcile scans "indexed docs not seen this run" — connector + status.
CREATE INDEX IF NOT EXISTS idx_connector_documents_reconcile
  ON inference.connector_documents (connector_id, status);

DROP TRIGGER IF EXISTS set_connector_documents_updated_at ON inference.connector_documents;
CREATE TRIGGER set_connector_documents_updated_at
  BEFORE UPDATE ON inference.connector_documents
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- ── RLS: members read their own org's rows; service_role does everything ─────
-- (The CRUD routes use the service-role client + explicit org scoping in app
--  code, same as AgentcoreMcpServers / vector-collections.)
ALTER TABLE inference.connectors ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.connectors TO authenticated;
GRANT ALL    ON inference.connectors TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org connectors" ON inference.connectors
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages connectors" ON inference.connectors
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inference.connector_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.connector_documents TO authenticated;
GRANT ALL    ON inference.connector_documents TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org connector documents" ON inference.connector_documents
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages connector documents" ON inference.connector_documents
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Audit actions for the connector CRUD route (C1) ─────────────────────────
-- Mirrors byok-keys / mcp_server.* via lib/inference/audit.ts's recordAudit
-- against inference.audit_log (NOT the agentcore audit_logs.service_type path).
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'connector.created';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'connector.updated';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'connector.deleted';
