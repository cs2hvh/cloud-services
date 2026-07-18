-- Agent delegation ("A2A" scoped narrowly per doc 02 — internal-only, one
-- agent calling another as a tool; see nextstespsAI/18-agent-delegation.md.
-- A sub-agent call is a REAL agentcore.runs row (own trace, own billing
-- through the existing usage pipeline — zero new billing code), not a wire
-- protocol.
--
-- Three columns, not two — root_run_id was added after a pre-migration
-- scalability review (2026-07-17) found that parent_run_id/depth alone let
-- a delegation tree spend far more than any single max_cost_cents the
-- customer configured (each run in the chain only bounds itself, and
-- nothing bounded the sum). root_run_id is inherited UNCHANGED down the
-- whole chain (never repointed at an intermediate parent), so the runner
-- can compute "how much has this whole tree spent so far" with one indexed
-- SUM(cost_cents) WHERE root_run_id = X instead of a recursive parent walk,
-- and refuse to delegate further once that sum would exceed the ROOT run's
-- own max_cost_cents — one real, shared budget for the whole tree.

ALTER TABLE agentcore.runs
  ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES agentcore.runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_run_id UUID REFERENCES agentcore.runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depth INT NOT NULL DEFAULT 0;

-- Fast "find this run's children" (dashboard trace view).
CREATE INDEX IF NOT EXISTS idx_agentcore_runs_parent
  ON agentcore.runs (parent_run_id)
  WHERE parent_run_id IS NOT NULL;

-- Fast "sum this tree's spend so far" (the cost-ceiling check above) — the
-- one query agent-delegate.ts issues before every delegate call.
CREATE INDEX IF NOT EXISTS idx_agentcore_runs_root
  ON agentcore.runs (root_run_id)
  WHERE root_run_id IS NOT NULL;

COMMENT ON COLUMN agentcore.runs.parent_run_id IS
  'Set only for a run created by the agent-delegate tool (workers/agent-runner/src/tools/agent-delegate.ts). NULL for every top-level/queued run.';
COMMENT ON COLUMN agentcore.runs.root_run_id IS
  'The top-level run at the head of this run''s delegation chain. NULL for a top-level run itself (it IS its own root — code reads root_run_id ?? id, not stored self-referentially to avoid an insert-time chicken/egg). Inherited unchanged at every depth — never repointed at an intermediate parent — so tree-wide spend is one indexed SUM(cost_cents) WHERE root_run_id = X, not a recursive walk.';
COMMENT ON COLUMN agentcore.runs.depth IS
  'Delegation hops from the top-level run (0 = top-level). agent-delegate.ts refuses to create a row past MAX_AGENT_DEPTH.';
