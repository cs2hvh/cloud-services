-- Phase 3 — Observability, Prompt Management, Guardrails Productization
-- Doc: nextstespsAI/06-evals-observability-guardrails.md  (S1 + S2 + S3)
--
-- Tables created:
--   inference.trace_spans         — partitioned, mirrors inference.usage
--   inference.prompts             — prompt library
--   inference.prompt_versions     — versioned templates with label deploys
--   inference.guardrail_policies  — per-org configurable guardrail rules
--
-- Pattern: idempotent IF NOT EXISTS, DO-block RLS guards,
-- gpu_set_updated_at trigger, service_role/authenticated grants.

-- ── S1: Tracing ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inference.trace_spans (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  trace_id        UUID NOT NULL,            -- groups multi-step spans
  parent_span_id  UUID,
  api_key_id      UUID,
  request_id      TEXT NOT NULL,            -- joins to inference.usage.request_id
  name            TEXT NOT NULL,            -- 'gen_ai.chat' | 'guardrail.pre' | ...
  model_id        TEXT,
  prompt_id       UUID,                     -- → inference.prompts
  prompt_version  INT,
  experiment_id   UUID,                     -- future: inference.experiments
  arm             TEXT,
  input_tokens    INT,
  output_tokens   INT,
  latency_ms      INT,
  ttft_ms         INT,
  cost_cents      NUMERIC(14,6),
  guardrail_action TEXT,                    -- clean|flagged|blocked|redacted
  status          TEXT NOT NULL DEFAULT 'success',
  payload_ref     TEXT,                     -- R2 key when sampled (NULL until R2 enabled)
  attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Monthly partitions: Jun 2026 → Dec 2026 + Jan 2027 buffer
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_06
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_07
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_08
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_09
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_10
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_11
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2026_12
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS inference.trace_spans_2027_01
  PARTITION OF inference.trace_spans
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
-- DEFAULT partition catches spans after Jan 2027 so inserts never fail.
-- When adding a new named partition (e.g. 2027-02), Postgres automatically
-- moves matching rows out of DEFAULT into the new partition.
CREATE TABLE IF NOT EXISTS inference.trace_spans_default
  PARTITION OF inference.trace_spans DEFAULT;

CREATE INDEX IF NOT EXISTS idx_trace_spans_org_time
  ON inference.trace_spans (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_spans_trace
  ON inference.trace_spans (trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_spans_request
  ON inference.trace_spans (request_id);

ALTER TABLE inference.trace_spans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.trace_spans TO authenticated;
GRANT ALL    ON inference.trace_spans TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org trace spans" ON inference.trace_spans
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages trace spans" ON inference.trace_spans
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S3: Prompt Management ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inference.prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

DROP TRIGGER IF EXISTS set_prompts_updated_at ON inference.prompts;
CREATE TRIGGER set_prompts_updated_at
  BEFORE UPDATE ON inference.prompts
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

ALTER TABLE inference.prompts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.prompts TO authenticated;
GRANT ALL    ON inference.prompts TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org prompts" ON inference.prompts
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages prompts" ON inference.prompts
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Versioned prompt templates.
-- template is messages[] with {{var}} placeholders, same shape as OpenAI messages.
-- label: 'production' | 'staging' | NULL — at most one 'production' per prompt.
CREATE TABLE IF NOT EXISTS inference.prompt_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id        UUID NOT NULL REFERENCES inference.prompts(id) ON DELETE CASCADE,
  version          INT NOT NULL,
  template         JSONB NOT NULL,             -- [{role, content}] with {{vars}}
  model_defaults   JSONB NOT NULL DEFAULT '{}'::jsonb, -- {model, temperature, max_tokens}
  label            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, version)
);

-- At most one active label per prompt (one production, one staging).
CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_version_label
  ON inference.prompt_versions (prompt_id, label)
  WHERE label IS NOT NULL;

ALTER TABLE inference.prompt_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.prompt_versions TO authenticated;
GRANT ALL    ON inference.prompt_versions TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org prompt versions" ON inference.prompt_versions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM inference.prompts p
        WHERE p.id = inference.prompt_versions.prompt_id
          AND inference.is_org_member(p.org_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages prompt versions" ON inference.prompt_versions
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── S2: Guardrail Policies ────────────────────────────────────────────────────

-- Per-org named policies stored in Postgres, cached into the GUARDRAILS KV namespace.
-- rules JSONB: [{type: 'pii'|'jailbreak'|'regex'|'moderation'|'schema', ...}]
--   pii rule:     {type:'pii', categories:['email','phone','ssn','card','api_key']}
--   jailbreak:    {type:'jailbreak'}  — enables the built-in pattern set
--   regex rule:   {type:'regex', pattern:'...', flags:'i', severity:'critical'|'soft'}
--   moderation:   {type:'moderation', model_id:'...'} — classifier (future S5)
CREATE TABLE IF NOT EXISTS inference.guardrail_policies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'warn'
              CHECK (mode IN ('off','warn','block','redact')),
  rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

DROP TRIGGER IF EXISTS set_guardrail_policies_updated_at ON inference.guardrail_policies;
CREATE TRIGGER set_guardrail_policies_updated_at
  BEFORE UPDATE ON inference.guardrail_policies
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_guardrail_policies_org
  ON inference.guardrail_policies(org_id);

ALTER TABLE inference.guardrail_policies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.guardrail_policies TO authenticated;
GRANT ALL    ON inference.guardrail_policies TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org guardrail policies" ON inference.guardrail_policies
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages guardrail policies" ON inference.guardrail_policies
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
