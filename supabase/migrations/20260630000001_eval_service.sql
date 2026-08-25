-- Doc: nextstespsAI/06-evals-observability-guardrails.md  (S4)
-- Creates:
--   inference.eval_datasets    — named test-case collections per org
--   inference.eval_cases       — individual (input, expected) rows inside a dataset
--   inference.eval_runs        — one run = dataset × target model × scorer config
--   inference.eval_results     — per-case scored output from a completed run

-- ── Eval datasets ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inference.eval_datasets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

DROP TRIGGER IF EXISTS set_eval_datasets_updated_at ON inference.eval_datasets;
CREATE TRIGGER set_eval_datasets_updated_at
  BEFORE UPDATE ON inference.eval_datasets
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_eval_datasets_org
  ON inference.eval_datasets (org_id, updated_at DESC);

ALTER TABLE inference.eval_datasets ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.eval_datasets TO authenticated;
GRANT ALL    ON inference.eval_datasets TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org eval datasets" ON inference.eval_datasets
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages eval datasets" ON inference.eval_datasets
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Eval cases ────────────────────────────────────────────────────────────────
-- input: OpenAI messages array [{role, content}] sent to the target model.
-- expected: reference answer — used by exact/contains/regex scorers and
--   surfaced to llm_judge as context (optional for pure LLM-judge workflows).

CREATE TABLE IF NOT EXISTS inference.eval_cases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  UUID NOT NULL REFERENCES inference.eval_datasets(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL,
  input       JSONB NOT NULL,
  expected    TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_dataset ON inference.eval_cases (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_cases_org     ON inference.eval_cases (org_id);

ALTER TABLE inference.eval_cases ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.eval_cases TO authenticated;
GRANT ALL    ON inference.eval_cases TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org eval cases" ON inference.eval_cases
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages eval cases" ON inference.eval_cases
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Eval runs ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE inference.eval_run_status AS ENUM ('queued','running','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inference.eval_scorer_type AS ENUM ('llm_judge','exact','contains','regex','json_schema');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inference.eval_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  dataset_id      UUID NOT NULL REFERENCES inference.eval_datasets(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- Target model to evaluate (any model_id in the catalog or BYOK model).
  model_id           TEXT NOT NULL,
  -- Placeholder for S3 prompt management integration (wire-up when prompts land).
  prompt_version_id  UUID,
  -- Placeholder for billing integration — keyed usage-event per run.
  billing_run_id     UUID,
  scorer_type     inference.eval_scorer_type NOT NULL DEFAULT 'llm_judge',
  -- llm_judge: { judge_model: string, judge_prompt?: string }
  --   judge_model must be a model that supports chat completions.
  --   judge_prompt can override the default scoring rubric.
  -- exact/contains/regex: { pattern?: string }  (regex only uses pattern)
  scorer_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          inference.eval_run_status NOT NULL DEFAULT 'queued',
  total_cases     INT NOT NULL DEFAULT 0,
  completed_cases INT NOT NULL DEFAULT 0,
  failed_cases    INT NOT NULL DEFAULT 0,
  -- Weighted average of per-case scores; null until at least one result.
  avg_score       NUMERIC(5,4),
  cost_cents      NUMERIC(14,4) NOT NULL DEFAULT 0,
  heartbeat_at    TIMESTAMPTZ,
  error           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_eval_runs_updated_at ON inference.eval_runs;
CREATE TRIGGER set_eval_runs_updated_at
  BEFORE UPDATE ON inference.eval_runs
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_eval_runs_org
  ON inference.eval_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset
  ON inference.eval_runs (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_pending
  ON inference.eval_runs (status, created_at)
  WHERE status IN ('queued','running');

ALTER TABLE inference.eval_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.eval_runs TO authenticated;
GRANT ALL    ON inference.eval_runs TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org eval runs" ON inference.eval_runs
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages eval runs" ON inference.eval_runs
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Eval results ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inference.eval_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES inference.eval_runs(id) ON DELETE CASCADE,
  case_id          UUID NOT NULL REFERENCES inference.eval_cases(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL,
  output           TEXT,
  score            NUMERIC(5,4),        -- 0=fail, 1=pass; fractional for llm_judge
  passed           BOOLEAN,             -- score >= 0.5 (set by runner at score time)
  scorer_reasoning TEXT,                -- judge explanation or assertion message
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed')),
  latency_ms       INT,
  cost_cents       NUMERIC(14,4) NOT NULL DEFAULT 0,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_results_run ON inference.eval_results (run_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_org ON inference.eval_results (org_id);

ALTER TABLE inference.eval_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inference.eval_results TO authenticated;
GRANT ALL    ON inference.eval_results TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org eval results" ON inference.eval_results
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages eval results" ON inference.eval_results
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
