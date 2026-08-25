-- Doc: nextstespsAI/11-agent-implementation-plan.md (§7) + 12-agent-execution-stages.md (T0.1)
-- Agents v2 (`agentcore`) — Slice 1 "Durable Responses MVP" schema.
--
-- Creates the agentcore schema + four core tables:
--   agentcore.agents           — reusable agent definition (model, prompt, tools, budgets)
--   agentcore.runs             — one durable agent invocation (claimed by agent-runner)
--   agentcore.run_steps        — per-step trace + billing ledger (the waterfall)
--   agentcore.sandbox_sessions — code-interpreter microVM sessions (defined now, used in S3)
--
-- Deliberately a SIBLING of the existing `ai_agents` product — different schema,
-- no collision. Optional slices add their own tables later:
--   agent_memories (S5)  ·  mcp_servers + billing.active_agent_mcp (S4)  — NOT here.
--
-- Conventions mirror 20260630000001_eval_service.sql:
--   CREATE TABLE IF NOT EXISTS · public.gpu_set_updated_at() trigger ·
--   RLS enable + GRANT SELECT authenticated / ALL service_role ·
--   policies wrapped in DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$ ·
--   org membership via inference.is_org_member(org_id).
--
-- The runner + gateway use the service-role client and bypass RLS, identical to
-- every other cluster.

CREATE SCHEMA IF NOT EXISTS agentcore;

GRANT USAGE ON SCHEMA agentcore TO authenticated;
GRANT USAGE ON SCHEMA agentcore TO service_role;

-- ── Agents: reusable definition ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agentcore.agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  model          TEXT NOT NULL,                              -- catalog model id
  system_prompt  TEXT,
  -- [{type:'web_search'|'file_search'|'code'|'function'|'mcp', ...}]
  tools          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- {enabled, scope, max_items} — consumed in S5 (memory); ignored until then
  memory_policy  JSONB NOT NULL DEFAULT '{}'::jsonb,
  guardrail      TEXT NOT NULL DEFAULT 'warn',               -- reuses gateway guardrail enum
  max_steps      INT  NOT NULL DEFAULT 12 CHECK (max_steps BETWEEN 1 AND 100),
  -- REQUIRED cost ceiling — the third cost-runaway gate (§9). Copied onto each run.
  max_cost_cents INT  NOT NULL DEFAULT 100 CHECK (max_cost_cents > 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

DROP TRIGGER IF EXISTS set_agentcore_agents_updated_at ON agentcore.agents;
CREATE TRIGGER set_agentcore_agents_updated_at
  BEFORE UPDATE ON agentcore.agents
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_agentcore_agents_org
  ON agentcore.agents (org_id, updated_at DESC);

ALTER TABLE agentcore.agents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON agentcore.agents TO authenticated;
GRANT ALL    ON agentcore.agents TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org agents" ON agentcore.agents
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages agents" ON agentcore.agents
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Runs: one durable agent invocation ────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE agentcore.run_status AS ENUM
    ('queued','running','requires_action','completed','failed','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agentcore.runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  agent_id             UUID REFERENCES agentcore.agents(id) ON DELETE SET NULL,
  api_key_id           UUID,                        -- inference.api_keys.id (billed key)
  billing_user_id      UUID NOT NULL,               -- org payer, resolved at create
  previous_response_id UUID REFERENCES agentcore.runs(id),   -- stateful chaining
  status               agentcore.run_status NOT NULL DEFAULT 'queued',
  input                JSONB NOT NULL,
  output               JSONB,
  step_count           INT  NOT NULL DEFAULT 0,
  cost_cents           NUMERIC(14,4) NOT NULL DEFAULT 0,     -- running total, mid-run guard
  max_cost_cents       INT  NOT NULL,                        -- copied from agent/request
  error                TEXT,
  claimed_by           TEXT,                        -- runner pod id (claim pattern)
  heartbeat_at         TIMESTAMPTZ,                 -- stale-run reaping
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_agentcore_runs_updated_at ON agentcore.runs;
CREATE TRIGGER set_agentcore_runs_updated_at
  BEFORE UPDATE ON agentcore.runs
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

-- Partial index: the runner's atomic-claim scan (WHERE status IN ('queued','running')).
CREATE INDEX IF NOT EXISTS idx_agentcore_runs_claim
  ON agentcore.runs (status, created_at)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS idx_agentcore_runs_org
  ON agentcore.runs (org_id, created_at DESC);

ALTER TABLE agentcore.runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON agentcore.runs TO authenticated;
GRANT ALL    ON agentcore.runs TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org runs" ON agentcore.runs
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages runs" ON agentcore.runs
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Run steps: the trace + per-step billing ledger ────────────────────────────

CREATE TABLE IF NOT EXISTS agentcore.run_steps (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES agentcore.runs(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  step_index    INT  NOT NULL,
  -- 'model'|'web_search'|'file_search'|'code'|'function'|'mcp'
  step_type     TEXT NOT NULL,
  tool_name     TEXT,
  input_tokens  INT,
  output_tokens INT,
  units         NUMERIC(12,4),
  unit_label    TEXT,
  cost_cents    NUMERIC(14,4) NOT NULL DEFAULT 0,
  latency_ms    INT,
  status        TEXT NOT NULL DEFAULT 'success',
  -- args/result preview (brand-scrubbed); R2 ref for large payloads
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_agentcore_run_steps_run
  ON agentcore.run_steps (run_id, step_index);
CREATE INDEX IF NOT EXISTS idx_agentcore_run_steps_org
  ON agentcore.run_steps (org_id);

ALTER TABLE agentcore.run_steps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON agentcore.run_steps TO authenticated;
GRANT ALL    ON agentcore.run_steps TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org run steps" ON agentcore.run_steps
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages run steps" ON agentcore.run_steps
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sandbox sessions (code interpreter only; billed per second) ────────────────
-- Defined now so the schema is stable; only exercised in S3 (code interpreter).
-- kind is constrained to 'code' — browser automation was cut (§2).

CREATE TABLE IF NOT EXISTS agentcore.sandbox_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES agentcore.runs(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'code' CHECK (kind = 'code'),  -- browser removed
  state         TEXT NOT NULL DEFAULT 'provisioning'
                CHECK (state IN ('provisioning','running','stopped')),
  per_sec_cents NUMERIC(10,6) NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ,
  stopped_at    TIMESTAMPTZ,
  idle_deadline TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agentcore_sandbox_sessions_run
  ON agentcore.sandbox_sessions (run_id);
-- Idle-reaper scan: still-live sessions past their idle_deadline.
CREATE INDEX IF NOT EXISTS idx_agentcore_sandbox_sessions_reap
  ON agentcore.sandbox_sessions (state, idle_deadline)
  WHERE state IN ('provisioning','running');

ALTER TABLE agentcore.sandbox_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON agentcore.sandbox_sessions TO authenticated;
GRANT ALL    ON agentcore.sandbox_sessions TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org sandbox sessions" ON agentcore.sandbox_sessions
    FOR SELECT USING (inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages sandbox sessions" ON agentcore.sandbox_sessions
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
