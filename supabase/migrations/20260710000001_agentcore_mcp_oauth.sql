-- Doc: nextstespsAI/14-agent-mcp-implementation.md (§10 decision #2 — OAuth 2.1
-- is the M6-first follow-up). Adds OAuth 2.1 Authorization Code + PKCE support
-- as a second auth mode alongside the existing static-bearer-token mode.
--
-- Scope decision (manual client registration, no RFC 7591 Dynamic Client
-- Registration): the customer creates their own OAuth app on the provider
-- (GitHub/Slack/etc.) and pastes client_id/client_secret when registering the
-- server here — the same trust model byok-keys already uses for upstream API
-- keys. DCR is a possible later addition; nothing here blocks it (a NULL
-- oauth_client_id combined with a discovered `registerClient()` call is a
-- strict superset of this schema).
--
-- auth_type='static' (default) preserves 100% of existing behavior — every
-- row created before this migration keeps working unchanged via
-- auth_token_enc, same as M1-M5.

ALTER TABLE agentcore.mcp_servers
  ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'static'
    CHECK (auth_type IN ('static', 'oauth')),
  -- OAuth client credentials (the customer's own OAuth app on the provider).
  -- client_secret is encrypted the same way auth_token_enc already is;
  -- client_id is not a secret (it's public in every authorization URL) so it
  -- stays plaintext, consistent with how OAuth client_ids are always treated.
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT,
  ADD COLUMN IF NOT EXISTS oauth_client_secret_enc BYTEA,
  ADD COLUMN IF NOT EXISTS oauth_scope TEXT,
  -- Tokens obtained via the authorization-code exchange, refreshed at runtime
  -- by agent-runner (the only place that ever calls a live MCP tool, so it's
  -- also the only place that discovers a token is expired).
  ADD COLUMN IF NOT EXISTS oauth_access_token_enc BYTEA,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token_enc BYTEA,
  ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMPTZ,
  -- Cached RFC 9728 / RFC 8414 discovery results — avoids re-discovering the
  -- authorization server on every connect and every refresh.
  ADD COLUMN IF NOT EXISTS oauth_authorization_server_url TEXT,
  ADD COLUMN IF NOT EXISTS oauth_resource_metadata JSONB,
  -- 'pending' = registered but no human has completed the consent flow yet;
  -- 'connected' = has a valid (or refreshable) token; 'error' = last
  -- exchange/refresh failed (see oauth_last_error), surfaced in the
  -- management UI same as the existing status/last_error columns.
  ADD COLUMN IF NOT EXISTS oauth_status TEXT
    CHECK (oauth_status IN ('pending', 'connected', 'error')),
  ADD COLUMN IF NOT EXISTS oauth_last_error TEXT;

-- oauth-mode rows must have started the registration with a client_id; the
-- CHECK is deliberately loose beyond that (tokens/status are populated later,
-- by the callback route, not at INSERT time — a freshly-registered oauth
-- server has oauth_status='pending' and no tokens yet).
DO $$ BEGIN
  ALTER TABLE agentcore.mcp_servers
    ADD CONSTRAINT mcp_servers_oauth_requires_client_id
    CHECK (auth_type = 'static' OR oauth_client_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'mcp_server.oauth_connected';
