-- ============================================================
-- Inference Platform Schema Migration
--
-- Creates the `inference` schema for AhuraCloud's AI services:
--   • Serverless Inference (proxy to OpenRouter + RunPod-hosted FT/BYO models)
--   • Fine-Tuning (LoRA on RunPod)
--   • Embeddings + Managed Vector Store
--   • BYO Model Hosting (Truss/Docker on RunPod)
--
-- Designed for enterprise scale from day 0:
--   • Multi-tenant orgs with member roles
--   • API keys hashed at rest, prefix-identifiable, scoped, per-key budgets
--   • BYOK provider keys encrypted (pgcrypto + KMS-rotated key)
--   • Usage + audit tables partitioned by month
--   • Zero Data Retention toggle per key
--   • RLS enforced everywhere
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Schema
CREATE SCHEMA IF NOT EXISTS inference;

COMMENT ON SCHEMA inference IS
  'AhuraCloud AI Platform: serverless inference gateway, fine-tuning, embeddings + vector store, BYO model hosting';

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE inference.org_role AS ENUM (
  'owner',
  'admin',
  'developer',
  'viewer'
);

CREATE TYPE inference.member_status AS ENUM (
  'active',
  'invited',
  'suspended'
);

CREATE TYPE inference.byok_provider AS ENUM (
  'openrouter',
  'openai',
  'anthropic',
  'google',
  'mistral',
  'custom'
);

CREATE TYPE inference.serving_type AS ENUM (
  'proxy',       -- proxied through OpenRouter (or other upstream gateway)
  'runpod_ft',   -- RunPod-served LoRA from our fine-tuning product
  'runpod_byo'   -- RunPod-served BYO container deploy
);

CREATE TYPE inference.model_modality AS ENUM (
  'chat',
  'completion',
  'embedding',
  'image',
  'audio_stt',
  'audio_tts',
  'video',
  'rerank'
);

CREATE TYPE inference.usage_status AS ENUM (
  'success',
  'error_upstream',
  'error_rate_limit',
  'error_budget',
  'error_auth',
  'error_validation',
  'error_internal',
  'cancelled'
);

CREATE TYPE inference.billing_source AS ENUM (
  'platform',    -- billed against AhuraCloud credit balance
  'byok'         -- billed by upstream provider against user's own key
);

CREATE TYPE inference.finetune_status AS ENUM (
  'queued',
  'preparing',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE inference.deployment_status AS ENUM (
  'building',
  'deploying',
  'active',
  'paused',
  'failed',
  'deleted'
);

CREATE TYPE inference.audit_action AS ENUM (
  'org.created',
  'org.updated',
  'org.deleted',
  'member.invited',
  'member.joined',
  'member.role_changed',
  'member.removed',
  'key.created',
  'key.rotated',
  'key.revoked',
  'key.scope_changed',
  'key.budget_changed',
  'byok.added',
  'byok.removed',
  'finetune.created',
  'finetune.cancelled',
  'deployment.created',
  'deployment.updated',
  'deployment.deleted',
  'collection.created',
  'collection.deleted'
);

-- ============================================================
-- ORGANIZATIONS
--   Day-1 multi-tenancy. Every user has a default personal org auto-created.
--   Keys and usage are org-scoped, not user-scoped, so teams work cleanly.
-- ============================================================

CREATE TABLE inference.orgs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Billing wallet (sourced from existing AhuraCloud user credits for personal org;
  -- enterprise orgs may have a dedicated wallet — handled by app layer)
  billing_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Compliance / privacy posture for the whole org
  zdr_default   BOOLEAN NOT NULL DEFAULT FALSE,
  region_pin    TEXT,  -- e.g. 'us', 'eu' — null = any

  -- Soft delete
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orgs_owner ON inference.orgs(owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orgs_billing_user ON inference.orgs(billing_user_id) WHERE deleted_at IS NULL;

CREATE TABLE inference.org_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       inference.org_role NOT NULL DEFAULT 'developer',
  status     inference.member_status NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  joined_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON inference.org_members(user_id) WHERE status = 'active';
CREATE INDEX idx_org_members_org ON inference.org_members(org_id) WHERE status = 'active';

-- ============================================================
-- API KEYS
--   • Hashed at rest with sha256 (key never recoverable; shown once at creation)
--   • Prefix-identifiable for dashboard display (first 8 chars + last 4)
--   • Per-key budgets in cents, hard cap enforced at edge before serving
--   • Optional model allowlist, IP allowlist
--   • ZDR toggle per key (overrides org default OFF→ON only; never weaker)
-- ============================================================

CREATE TABLE inference.api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  name             TEXT NOT NULL,
  key_prefix       TEXT NOT NULL,                 -- "ahu_live_abc12345"
  key_last_four    TEXT NOT NULL,                 -- "...wxyz"
  key_hash         TEXT NOT NULL UNIQUE,          -- sha256 of full key

  -- Scope
  allowed_models   TEXT[],                        -- null = all models allowed
  allowed_ip_cidrs CIDR[],                        -- null = no IP restriction
  zdr_enabled      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Budgets (cents)
  monthly_budget_cents BIGINT,                    -- soft cap, alerts at 80/90/95%
  hard_cap_cents       BIGINT,                    -- absolute cap; reject when reached

  -- Lifecycle
  expires_at       TIMESTAMPTZ,
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (key_prefix LIKE 'ahu_%')
);

CREATE INDEX idx_api_keys_org_active ON inference.api_keys(org_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_hash ON inference.api_keys(key_hash) WHERE revoked_at IS NULL;

-- ============================================================
-- BYOK PROVIDER KEYS
--   Encrypted upstream provider keys; used when caller opts for BYOK billing.
--   AES-GCM encryption applied at the app layer with a KMS-rotated key;
--   here we store ciphertext only.
-- ============================================================

CREATE TABLE inference.byok_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  added_by_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  name                TEXT NOT NULL,
  provider            inference.byok_provider NOT NULL,
  ciphertext          BYTEA NOT NULL,                -- AES-GCM(key, kms_dek)
  kms_key_version     INTEGER NOT NULL DEFAULT 1,    -- supports rotation
  key_last_four       TEXT NOT NULL,                 -- for UI display only

  -- Verification
  is_valid            BOOLEAN NOT NULL DEFAULT TRUE,
  last_verified_at    TIMESTAMPTZ,
  last_verify_error   TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, name)
);

CREATE INDEX idx_byok_keys_org_provider ON inference.byok_keys(org_id, provider) WHERE is_valid = TRUE;

-- ============================================================
-- MODEL CATALOG
--   Unified registry across upstream-proxy models (OpenRouter) and
--   RunPod-served models (our FT outputs, BYO deploys).
-- ============================================================

CREATE TABLE inference.models (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id              TEXT UNIQUE NOT NULL,        -- e.g. "anthropic/claude-opus-4-7"
  display_name          TEXT NOT NULL,
  description           TEXT,
  modality              inference.model_modality NOT NULL DEFAULT 'chat',
  serving_type          inference.serving_type NOT NULL,

  -- Upstream routing
  upstream_provider     inference.byok_provider,     -- for proxy type
  upstream_model_id     TEXT,                        -- OpenRouter's id for the model
  runpod_endpoint_id    TEXT,                        -- for RunPod-served types
  org_id                UUID REFERENCES inference.orgs(id) ON DELETE CASCADE,
  -- ^ NULL = public catalog model; set = private to that org (FT outputs, BYO deploys)

  -- Capabilities (jsonb so we can extend without migrations)
  capabilities          JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- shape: { "streaming": true, "tools": true, "json_mode": true, "vision": false,
  --          "context_window": 200000, "max_output": 64000 }

  -- Pricing (cents per million tokens / cents per call where appropriate)
  pricing               JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- shape: { "input_cents_per_mtok": 300, "output_cents_per_mtok": 1500,
  --          "cached_cents_per_mtok": 30 }

  -- Off-peak discount (UTC window + percent off, applied only to platform-billed)
  off_peak              JSONB,
  -- shape: { "window_utc": "05:00-11:00", "discount_pct": 30 }

  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured           BOOLEAN NOT NULL DEFAULT FALSE,  -- for curated catalog view
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_models_modality_active ON inference.models(modality, is_active);
CREATE INDEX idx_models_org ON inference.models(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_models_featured ON inference.models(is_featured, sort_order) WHERE is_featured = TRUE;

-- ============================================================
-- ROUTING PRESETS
--   Saved fallback chains / provider preferences referenceable by name.
--   Forwarded to OpenRouter as the appropriate routing headers.
-- ============================================================

CREATE TABLE inference.model_presets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  config        JSONB NOT NULL,
  -- { "models": ["anthropic/claude-opus-4-7", "openai/gpt-5.5"],
  --   "provider_sort": "throughput",
  --   "max_latency_ms": 1500 }
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- ============================================================
-- USAGE (partitioned by month)
--   Every billable request writes one row. Partitioning enables cheap
--   archival of old months to cold storage once we cross ~1B rows.
-- ============================================================

CREATE TABLE inference.usage (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  api_key_id        UUID NOT NULL,
  user_id           UUID,                            -- the human who made the call (if known)
  model_id          TEXT NOT NULL,
  modality          inference.model_modality NOT NULL,
  request_id        TEXT NOT NULL,                   -- correlate with traces / audit
  billed_to         inference.billing_source NOT NULL,

  -- Token counts (null for non-text modalities)
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  cached_tokens     INTEGER,

  -- Image / audio / video accounting
  num_units         INTEGER,                         -- images generated, audio seconds, etc.
  unit_label        TEXT,                            -- 'image' | 'audio_sec' | 'video_sec'

  -- Cost in cents (computed at metering time, includes off-peak discount)
  cost_cents        BIGINT NOT NULL DEFAULT 0,
  upstream_cost_cents BIGINT NOT NULL DEFAULT 0,     -- what the upstream charged us
  is_off_peak       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Performance
  latency_ms        INTEGER,
  ttft_ms           INTEGER,                         -- time-to-first-token

  status            inference.usage_status NOT NULL,
  error_code        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Initial monthly partitions (May 2026 through Dec 2026)
CREATE TABLE inference.usage_y2026m05 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE inference.usage_y2026m06 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE inference.usage_y2026m07 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE inference.usage_y2026m08 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE inference.usage_y2026m09 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE inference.usage_y2026m10 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE inference.usage_y2026m11 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE inference.usage_y2026m12 PARTITION OF inference.usage
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX idx_usage_org_time ON inference.usage(org_id, created_at DESC);
CREATE INDEX idx_usage_api_key_time ON inference.usage(api_key_id, created_at DESC);
CREATE INDEX idx_usage_model_time ON inference.usage(model_id, created_at DESC);

-- ============================================================
-- AUDIT LOG (partitioned by month, append-only)
-- ============================================================

CREATE TABLE inference.audit_log (
  id               UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL,
  actor_user_id    UUID,                              -- null for system actions
  actor_api_key_id UUID,                              -- non-null for API-driven actions
  action           inference.audit_action NOT NULL,
  target_type      TEXT NOT NULL,                     -- 'api_key' | 'byok_key' | 'org' | etc.
  target_id        TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_address       INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE inference.audit_log_y2026m05 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE inference.audit_log_y2026m06 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE inference.audit_log_y2026m07 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE inference.audit_log_y2026m08 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE inference.audit_log_y2026m09 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE inference.audit_log_y2026m10 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE inference.audit_log_y2026m11 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE inference.audit_log_y2026m12 PARTITION OF inference.audit_log
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX idx_audit_org_time ON inference.audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_target ON inference.audit_log(target_type, target_id, created_at DESC);

-- ============================================================
-- FINE-TUNING JOBS
-- ============================================================

CREATE TABLE inference.finetunes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  created_by_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  name                  TEXT NOT NULL,
  base_model_id         TEXT NOT NULL,               -- references models.model_id
  method                TEXT NOT NULL DEFAULT 'lora',-- 'lora' | 'qlora' | 'full'
  hyperparams           JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- { "rank": 16, "alpha": 32, "lr": 2e-4, "epochs": 3, "batch_size": 4, ... }

  -- Dataset
  dataset_url           TEXT NOT NULL,               -- s3:// or https:// to JSONL
  dataset_token_count   BIGINT,
  validation_dataset_url TEXT,

  -- Orchestration
  status                inference.finetune_status NOT NULL DEFAULT 'queued',
  runpod_job_id         TEXT,
  bullmq_job_id         TEXT,
  gpu_sku               TEXT,                        -- 'A100-80GB' | 'H100-80GB' | etc.

  -- Output
  output_model_id       UUID REFERENCES inference.models(id) ON DELETE SET NULL,
  output_artifact_url   TEXT,                        -- s3:// to LoRA weights

  -- Accounting
  training_seconds      INTEGER,
  cost_cents            BIGINT,

  -- Lifecycle
  error_message         TEXT,
  queued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finetunes_org_status ON inference.finetunes(org_id, status, created_at DESC);
CREATE INDEX idx_finetunes_runpod_job ON inference.finetunes(runpod_job_id) WHERE runpod_job_id IS NOT NULL;

-- ============================================================
-- BYO MODEL DEPLOYMENTS
-- ============================================================

CREATE TABLE inference.deployments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  created_by_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  name                  TEXT NOT NULL,
  source                TEXT NOT NULL,               -- 'truss' | 'docker' | 'huggingface'
  source_ref            TEXT NOT NULL,               -- repo URL, image ref, or HF id
  source_revision       TEXT,                        -- git sha or image tag

  -- Compute
  gpu_sku               TEXT NOT NULL,               -- 'A100-80GB' | 'H100' | 'L40S' | 'A40'
  autoscale             JSONB NOT NULL DEFAULT '{"min_workers": 0, "max_workers": 4, "idle_timeout_s": 60}'::JSONB,

  -- Orchestration
  status                inference.deployment_status NOT NULL DEFAULT 'building',
  runpod_endpoint_id    TEXT,
  image_uri             TEXT,                        -- post-build container image
  build_log_url         TEXT,

  -- Linked model
  model_id              UUID REFERENCES inference.models(id) ON DELETE SET NULL,

  error_message         TEXT,
  deployed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, name)
);

CREATE INDEX idx_deployments_org_status ON inference.deployments(org_id, status);
CREATE INDEX idx_deployments_runpod_endpoint ON inference.deployments(runpod_endpoint_id) WHERE runpod_endpoint_id IS NOT NULL;

-- ============================================================
-- VECTOR COLLECTIONS (managed pgvector, per-tenant logical isolation)
--   Vector rows live in inference.vector_rows partitioned by collection_id hash
--   so we can split out hot collections later without schema migration.
-- ============================================================

CREATE TABLE inference.vector_collections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  dimensions            INTEGER NOT NULL CHECK (dimensions > 0 AND dimensions <= 4096),
  distance_metric       TEXT NOT NULL DEFAULT 'cosine'
                          CHECK (distance_metric IN ('cosine', 'l2', 'inner_product')),
  embedding_model_id    TEXT NOT NULL,
  -- Index config (built lazily; can rebuild online)
  index_type            TEXT NOT NULL DEFAULT 'hnsw'
                          CHECK (index_type IN ('hnsw', 'ivfflat', 'none')),
  index_params          JSONB NOT NULL DEFAULT '{"m": 16, "ef_construction": 64}'::JSONB,
  row_count             BIGINT NOT NULL DEFAULT 0,
  size_bytes            BIGINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE INDEX idx_vector_collections_org ON inference.vector_collections(org_id);

-- Rows table (variable-dim vector; specific dim enforced at app layer).
-- For >50M vector collections, consider migrating to a dedicated pgvector cluster
-- or a partitioned child table per collection_id.
CREATE TABLE inference.vector_rows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id         UUID NOT NULL REFERENCES inference.vector_collections(id) ON DELETE CASCADE,
  external_id           TEXT NOT NULL,
  embedding             vector(1536),                 -- default; we'll add wider variants as we go
  metadata              JSONB NOT NULL DEFAULT '{}'::JSONB,
  content               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, external_id)
);

CREATE INDEX idx_vector_rows_collection ON inference.vector_rows(collection_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at on row mutation
CREATE OR REPLACE FUNCTION inference.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Look up an active API key by its sha256 hash; returns the row or null.
-- Used by the edge gateway on every request — must stay fast and indexed.
CREATE OR REPLACE FUNCTION inference.lookup_api_key(p_hash TEXT)
RETURNS TABLE (
  key_id           UUID,
  org_id           UUID,
  allowed_models   TEXT[],
  allowed_ip_cidrs CIDR[],
  zdr_enabled      BOOLEAN,
  monthly_budget_cents BIGINT,
  hard_cap_cents       BIGINT,
  expires_at       TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT id, org_id, allowed_models, allowed_ip_cidrs, zdr_enabled,
         monthly_budget_cents, hard_cap_cents, expires_at
  FROM inference.api_keys
  WHERE key_hash = p_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW());
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_api_key TO service_role;

-- Bootstrap a personal org for a user on signup
CREATE OR REPLACE FUNCTION inference.bootstrap_personal_org(p_user_id UUID, p_email TEXT)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_slug   TEXT;
BEGIN
  -- Slug derived from local-part of email, suffixed for uniqueness
  v_slug := lower(regexp_replace(split_part(p_email, '@', 1), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(replace(p_user_id::text, '-', ''), 1, 6);

  INSERT INTO inference.orgs (slug, name, owner_user_id, billing_user_id)
  VALUES (v_slug, 'Personal', p_user_id, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO inference.org_members (org_id, user_id, role, status, joined_at)
  VALUES (v_org_id, p_user_id, 'owner', 'active', NOW());

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION inference.bootstrap_personal_org TO service_role;

-- ============================================================
-- TRIGGERS — updated_at maintenance
-- ============================================================

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON inference.orgs
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON inference.org_members
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON inference.api_keys
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_byok_keys_updated_at
  BEFORE UPDATE ON inference.byok_keys
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_models_updated_at
  BEFORE UPDATE ON inference.models
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_presets_updated_at
  BEFORE UPDATE ON inference.model_presets
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_finetunes_updated_at
  BEFORE UPDATE ON inference.finetunes
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_deployments_updated_at
  BEFORE UPDATE ON inference.deployments
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_vector_collections_updated_at
  BEFORE UPDATE ON inference.vector_collections
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

CREATE TRIGGER trg_vector_rows_updated_at
  BEFORE UPDATE ON inference.vector_rows
  FOR EACH ROW EXECUTE FUNCTION inference.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
--   Members can see their org's resources. Service role bypasses (edge gateway
--   uses service role and enforces auth itself).
-- ============================================================

ALTER TABLE inference.orgs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.org_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.byok_keys         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.models            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.model_presets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.finetunes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.deployments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.vector_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inference.vector_rows       ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an active member of this org?
CREATE OR REPLACE FUNCTION inference.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM inference.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Helper: does the current user have admin or owner role in this org?
CREATE OR REPLACE FUNCTION inference.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM inference.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

-- Orgs
CREATE POLICY orgs_select ON inference.orgs FOR SELECT
  USING (inference.is_org_member(id));

CREATE POLICY orgs_update ON inference.orgs FOR UPDATE
  USING (inference.is_org_admin(id));

-- Org members
CREATE POLICY org_members_select ON inference.org_members FOR SELECT
  USING (inference.is_org_member(org_id));

CREATE POLICY org_members_admin_write ON inference.org_members FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

-- API keys (admin-only by default; can be loosened later for developer self-service)
CREATE POLICY api_keys_admin_all ON inference.api_keys FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

-- BYOK keys
CREATE POLICY byok_keys_admin_all ON inference.byok_keys FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

-- Models — public catalog readable to all; org-private models only to members
CREATE POLICY models_public_select ON inference.models FOR SELECT
  USING (org_id IS NULL OR inference.is_org_member(org_id));

-- Presets
CREATE POLICY presets_member_select ON inference.model_presets FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY presets_admin_write ON inference.model_presets FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

-- Usage / audit — members read-only; writes by service role only
CREATE POLICY usage_member_select ON inference.usage FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY audit_member_select ON inference.audit_log FOR SELECT
  USING (inference.is_org_member(org_id));

-- Fine-tunes / deployments / vectors — members can read, admins can write
CREATE POLICY finetunes_member_select ON inference.finetunes FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY finetunes_admin_write ON inference.finetunes FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

CREATE POLICY deployments_member_select ON inference.deployments FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY deployments_admin_write ON inference.deployments FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

CREATE POLICY collections_member_select ON inference.vector_collections FOR SELECT
  USING (inference.is_org_member(org_id));
CREATE POLICY collections_admin_write ON inference.vector_collections FOR ALL
  USING (inference.is_org_admin(org_id))
  WITH CHECK (inference.is_org_admin(org_id));

CREATE POLICY vector_rows_member_select ON inference.vector_rows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inference.vector_collections c
      WHERE c.id = collection_id
        AND inference.is_org_member(c.org_id)
    )
  );

-- ============================================================
-- GRANTS
--   Service role has full access (used by edge gateway + workers).
--   Authenticated users use RLS-gated SELECT for dashboards.
-- ============================================================

GRANT USAGE ON SCHEMA inference TO service_role, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA inference TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA inference TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inference TO service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA inference TO authenticated;
GRANT EXECUTE ON FUNCTION inference.is_org_member, inference.is_org_admin TO authenticated;
