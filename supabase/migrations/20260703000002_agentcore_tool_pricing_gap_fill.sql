-- Doc: nextstespsAI/11-agent-implementation-plan.md (§9) · 12-agent-execution-stages.md (T0.4)
-- Agentcore hosted-tool pricing — GAP FILL for file_search + memory.
--
-- 20260701000003 priced web_search / code / function, but the runner's
-- TOOL_PRICE_KEY_TO_LABEL also expects cents_per_file_search, and the S5 memory
-- tool meters `memory_write` / `memory_search`. Without these rows those tool
-- steps price at 0 toward the mid-run cost ceiling (§9). This adds them.
--
-- Same shape as 20260701000003 (internal is_active=false rows; modality
-- 'agent_tool' from migration …002, already committed → safe in a separate tx).
-- Idempotent via ON CONFLICT (model_id) DO UPDATE.
--
-- ⚠️ RATES ARE PLACEHOLDERS — PENDING_FINANCE (like the other agent/* rows).
-- They seed the metering CONTRACT so the ceiling guard sums tool spend; finance
-- signs off real rates before this bills money (must sit on Phase-0 billing, §9).

-- ── agent/file-search ────────────────────────────────────────────────────────
-- Grounded RAG over the org's vector collections. Billed per query (embed + recall).
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'agent/file-search',
  'Agent File Search',
  'Internal pricing row for the agentcore file_search hosted tool. Not a customer-selectable model.',
  'agent_tool', 'proxy', NULL,
  '{ "internal": true, "tool_type": "file_search" }'::JSONB,
  '{ "cents_per_file_search": 0.2 }'::JSONB,
  FALSE, FALSE, 903
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();

-- ── agent/memory ─────────────────────────────────────────────────────────────
-- Durable per-agent memory (S5). Two metered actions: write (embed + store) and
-- search (embed + recall) — the runner emits unit_label `memory_write` /
-- `memory_search`, so both keys live on this one row.
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'agent/memory',
  'Agent Memory',
  'Internal pricing row for the agentcore memory hosted tool. Not a customer-selectable model.',
  'agent_tool', 'proxy', NULL,
  '{ "internal": true, "tool_type": "memory" }'::JSONB,
  '{ "cents_per_memory_write": 0.1, "cents_per_memory_search": 0.1 }'::JSONB,
  FALSE, FALSE, 904
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();
