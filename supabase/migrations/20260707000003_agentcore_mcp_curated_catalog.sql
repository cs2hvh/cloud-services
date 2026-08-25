-- Doc: nextstespsAI/14-agent-mcp-implementation.md (§4, M4 — curated catalog)
--
-- Seeds a first, hand-picked curated catalog (org_id = NULL, visibility =
-- 'curated') — platform-vetted MCP servers every org can one-click-attach
-- from the builder's "Saved servers" picker or the new MCP Servers page,
-- with zero registration of their own. Doc 14 §4's longer-term plan is to
-- seed this from the official MCP registry (registry.modelcontextprotocol.io)
-- via a periodic sync job — this migration is the small, hand-typed start
-- ("a few rows", per the M4 staging row), not that automation.
--
-- Both entries below were LIVE-VERIFIED (2026-07-07): real Streamable HTTP
-- MCP servers, no auth required, real tool calls confirmed end-to-end through
-- a real agent run (ask_question / resolve-library-id / query-docs).
--
-- Idempotent via the partial unique index added in 20260707000002
-- (idx_agentcore_mcp_servers_curated_slug on (slug) WHERE visibility='curated').

INSERT INTO agentcore.mcp_servers (org_id, slug, display_name, server_url, visibility, status)
VALUES
  (NULL, 'deepwiki', 'DeepWiki — GitHub repo Q&A', 'https://mcp.deepwiki.com/mcp', 'curated', 'active'),
  (NULL, 'context7', 'Context7 — library docs search', 'https://mcp.context7.com/mcp', 'curated', 'active')
ON CONFLICT (slug) WHERE visibility = 'curated' DO UPDATE SET
  display_name = EXCLUDED.display_name,
  server_url   = EXCLUDED.server_url,
  status       = EXCLUDED.status,
  updated_at   = NOW();
