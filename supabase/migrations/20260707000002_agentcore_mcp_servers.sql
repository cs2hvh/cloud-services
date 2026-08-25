-- Doc: nextstespsAI/14-agent-mcp-implementation.md (§4, M3 — the registry layer)
--
-- agentcore.mcp_servers — control-plane metadata only (no hosting columns:
-- client-first points at a remote URL, not a container we run, doc 14 §1/§11).
-- Register a server once, bind it by slug across agents — this is what makes
-- MCP a real many-service system instead of a per-agent inline URL (§4).
--
-- org_id = NULL rows are platform-curated (visibility='curated'), seeded from
-- the official MCP registry per §4's "scale the catalog, don't hand-maintain
-- it" note — M4 adds the seeding job + management screen; this migration just
-- adds the table.
--
-- RLS mirrors agentcore.agents (20260701000001): members read their own org's
-- rows via inference.is_org_member(org_id), PLUS everyone reads curated rows
-- (org_id IS NULL); service_role does everything (the API route uses
-- service-role + explicit org scoping in app code, same as AgentcoreAgents).

CREATE TABLE IF NOT EXISTS agentcore.mcp_servers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID REFERENCES inference.orgs(id) ON DELETE CASCADE,  -- NULL = platform-curated
  slug           TEXT NOT NULL,                     -- bind key (org-unique, or global for curated)
  display_name   TEXT NOT NULL,
  server_url     TEXT NOT NULL,                     -- remote Streamable HTTP endpoint
  auth_token_enc BYTEA,                             -- encrypted (AES-256-GCM, lib/inference/crypto.ts)
  allowed_tools  JSONB NOT NULL DEFAULT '[]'::jsonb, -- org-level allowlist (agent decl can narrow further)
  visibility     TEXT NOT NULL DEFAULT 'private'
                 CHECK (visibility IN ('private', 'curated')),
  tool_schemas   JSONB NOT NULL DEFAULT '[]'::jsonb, -- cached tools/list (refresh on register + cron)
  schemas_refreshed_at TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'error', 'disabled')),
  last_error     TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NOTE: this alone does NOT protect curated-slug uniqueness — Postgres never
  -- treats two NULL org_id values as equal in a UNIQUE constraint, so two
  -- curated rows could both take slug='github'. The partial index below is
  -- what actually closes that gap; this constraint only dedupes PRIVATE rows
  -- (org_id NOT NULL) within one org.
  UNIQUE(org_id, slug),
  -- Curated rows are platform-owned (no org); private rows must belong to an org.
  CHECK ((visibility = 'curated' AND org_id IS NULL) OR (visibility = 'private' AND org_id IS NOT NULL))
);

-- Closes the NULL-is-never-equal gap above: enforces slug uniqueness among
-- curated rows specifically (org_id is always NULL there, so UNIQUE(org_id,
-- slug) alone can't do it). resolveRegistryMcpConfig's `.maybeSingle()` would
-- otherwise silently fail closed (ambiguous-row error → treated as "not
-- found") if two curated rows ever collided on slug.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentcore_mcp_servers_curated_slug
  ON agentcore.mcp_servers (slug) WHERE visibility = 'curated';

DROP TRIGGER IF EXISTS set_agentcore_mcp_servers_updated_at ON agentcore.mcp_servers;
CREATE TRIGGER set_agentcore_mcp_servers_updated_at
  BEFORE UPDATE ON agentcore.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.gpu_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_agentcore_mcp_servers_org
  ON agentcore.mcp_servers (org_id, slug);
CREATE INDEX IF NOT EXISTS idx_agentcore_mcp_servers_curated
  ON agentcore.mcp_servers (visibility) WHERE visibility = 'curated';

ALTER TABLE agentcore.mcp_servers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON agentcore.mcp_servers TO authenticated;
GRANT ALL    ON agentcore.mcp_servers TO service_role;

DO $$ BEGIN
  CREATE POLICY "members read own org or curated mcp servers" ON agentcore.mcp_servers
    FOR SELECT USING (org_id IS NULL OR inference.is_org_member(org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service role manages mcp servers" ON agentcore.mcp_servers
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Audit log actions for the mcp-servers CRUD route (mirrors byok-keys's
-- inference.audit_log path, lib/inference/audit.ts's recordAudit — NOT the
-- separate agentcore_agent / audit_logs.service_type CHECK path used by
-- /api/agents, which has its own unrelated pre-existing gap). ────────────────
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'mcp_server.registered';
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'mcp_server.removed';
