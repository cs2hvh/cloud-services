-- Doc: nextstespsAI/11-agent-implementation-plan.md (§9) · 12-agent-execution-stages.md (T0.4)
-- Agentcore hosted-tool pricing rows.
--
-- These are INTERNAL pseudo-catalog rows: is_active = FALSE keeps them out of the
-- customer model picker, but the USAGE_EVENTS consumer resolves pricing by
-- model_id with NO is_active filter — so agent tool steps price through the exact
-- same pipeline as everything else (no parallel queue; doc 09 §2.B).
--
-- The runner emits a UsageEvent with:
--   modelId   = one of these ids
--   unitLabel = 'web_search' | 'cpu_second' | 'function_call'
--   numUnits  = searches | CPU-seconds | calls
-- and consumers/usage.ts computeUnitCost() multiplies by the matching rate.
--
-- ⚠️ RATES BELOW ARE PLACEHOLDERS — PENDING_FINANCE.
-- Agentcore is the platform's first non-zero-markup service (search resale +
-- sandbox compute carry margin, §9). Finance must sign off on the actual rates
-- before this bills real money, and it must sit on the Phase-0 hardened billing
-- RPCs. Until then these seed the metering CONTRACT so the pipeline is testable.

-- ── agent/web-search ─────────────────────────────────────────────────────────
-- Brand-hidden web search (Brave default, Exa premium). Billed per search.
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'agent/web-search',
  'Agent Web Search',
  'Internal pricing row for the agentcore web_search hosted tool. Not a customer-selectable model.',
  'agent_tool', 'proxy', NULL,
  '{ "internal": true, "tool_type": "web_search" }'::JSONB,
  '{ "cents_per_web_search": 1 }'::JSONB,
  FALSE, FALSE, 900
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();

-- ── agent/code-interpreter ───────────────────────────────────────────────────
-- Sandboxed Python (S3). Billed per microVM CPU-second. Note: the primary settle
-- path is settleSandboxSession on stop; this row also lets standalone /v1/tools/code
-- calls meter through the usage pipeline.
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'agent/code-interpreter',
  'Agent Code Interpreter',
  'Internal pricing row for the agentcore code hosted tool. Not a customer-selectable model.',
  'agent_tool', 'proxy', NULL,
  '{ "internal": true, "tool_type": "code" }'::JSONB,
  '{ "cents_per_cpu_second": 0.06 }'::JSONB,
  FALSE, FALSE, 901
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();

-- ── agent/function-call ──────────────────────────────────────────────────────
-- Inline function webhook dispatch. Billed per call (thin).
INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'agent/function-call',
  'Agent Function Call',
  'Internal pricing row for the agentcore function webhook tool. Not a customer-selectable model.',
  'agent_tool', 'proxy', NULL,
  '{ "internal": true, "tool_type": "function" }'::JSONB,
  '{ "cents_per_function_call": 0.02 }'::JSONB,
  FALSE, FALSE, 902
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();
