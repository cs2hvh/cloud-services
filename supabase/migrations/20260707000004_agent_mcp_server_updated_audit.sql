-- Doc: nextstespsAI/14-agent-mcp-implementation.md (§4, M4 follow-up — edit support)
--
-- Adds the audit action for PATCH /api/agents/mcp-servers/[id] (edit a
-- registered server — display_name/server_url/auth_token/allowed_tools).
-- Same enum, same pattern as the two values 20260707000002 already added
-- ('mcp_server.registered', 'mcp_server.removed') — this just closes the
-- CRUD set with the missing "U".
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'mcp_server.updated';
