-- Doc: nextstespsAI/14-agent-mcp-implementation.md (§4, M2)
-- Agentcore MCP tool pricing — the "billing later just works" contract.
--
-- M1 (adapter core) shipped and metering already emits unit_label `mcp_call`
-- for every MCP tool call (tools/mcp.ts), but without a matching agent/*
-- catalog row it prices at 0 toward the mid-run cost ceiling (§9) and never
-- reaches the runner's TOOL_PRICE_KEY_TO_LABEL map. This adds the row.
--
-- Same shape as 20260703000002 (internal is_active=false row; modality
-- 'agent_tool'). Idempotent via ON CONFLICT (model_id) DO UPDATE.
--
-- ⚠️ RATE IS A PLACEHOLDER — PENDING_FINANCE (like every other agent/* row).
-- It seeds the metering CONTRACT so the ceiling guard sums MCP spend; finance
-- signs off the real rate before this bills money (must sit on Phase-0 billing).
--
-- No `billing.active_agent_mcp` here — that's the always-on *hosting* charge
-- (doc 14 §11, deferred). The client bills per call, which needs no always-on
-- table.

INSERT INTO inference.models (
  model_id, display_name, description,
  modality, serving_type, upstream_provider,
  capabilities, pricing, is_active, is_featured, sort_order
) VALUES (
  'agent/mcp',
  'Agent MCP Tool Call',
  'Internal pricing row for the agentcore mcp client tool (remote MCP server calls). Not a customer-selectable model.',
  'agent_tool', 'proxy', NULL,
  '{ "internal": true, "tool_type": "mcp" }'::JSONB,
  '{ "cents_per_mcp_call": 0.2 }'::JSONB,
  FALSE, FALSE, 905
)
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  pricing      = EXCLUDED.pricing,
  is_active    = EXCLUDED.is_active,
  updated_at   = NOW();
