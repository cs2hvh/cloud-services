/**
 * agentcore.agents — control-plane queries (service-role, org-scoped).
 *
 * Doc: nextstespsAI/12-agent-execution-stages.md (T1.4a)
 *
 * Every method is scoped by org_id so a caller can only ever touch their own
 * org's agents (the API route resolves org_id from the authed user's active org;
 * the service-role client bypasses RLS, so org scoping MUST be applied here).
 *
 * Types are defined locally — the control plane only persists agent config
 * (validated by zod in the route); it never runs the loop, so it doesn't need
 * @ahura/agent-core. The shared package's consumers are the runtime (runner) and
 * the gateway, not this CRUD layer.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** A declared tool on an agent (hosted / inline function / mcp). Kept loose —
 *  the route's zod schema is the validation authority. */
export type AgentToolDecl = { type: string; [key: string]: unknown };

export interface AgentcoreAgentRow {
  id: string;
  org_id: string;
  name: string;
  model: string;
  system_prompt: string | null;
  tools: AgentToolDecl[];
  memory_policy: Record<string, unknown>;
  guardrail: string;
  max_steps: number;
  max_cost_cents: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentcoreAgentInsert {
  org_id: string;
  name: string;
  model: string;
  system_prompt?: string | null;
  tools?: AgentToolDecl[];
  memory_policy?: Record<string, unknown>;
  guardrail?: string;
  max_steps?: number;
  max_cost_cents?: number;
  created_by: string;
}

export interface AgentcoreAgentUpdate {
  name?: string;
  model?: string;
  system_prompt?: string | null;
  tools?: AgentToolDecl[];
  memory_policy?: Record<string, unknown>;
  guardrail?: string;
  max_steps?: number;
  max_cost_cents?: number;
  is_active?: boolean;
}

export interface MutationResult {
  success: boolean;
  data?: AgentcoreAgentRow;
  /** Postgres error code when relevant (e.g. "23505" unique violation). */
  code?: string;
  error?: string;
}

const SELECT_COLS =
  "id, org_id, name, model, system_prompt, tools, memory_policy, guardrail, max_steps, max_cost_cents, is_active, created_by, created_at, updated_at";

function client(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const AgentcoreAgents = {
  /** Fail-fast catalog check: is this an active model id? (Run-time model-scope
   *  is still enforced by the gateway; this just catches typos at create time.) */
  async modelExists(modelId: string): Promise<boolean> {
    const { data } = await client()
      .schema("inference")
      .from("models")
      .select("model_id")
      .eq("model_id", modelId)
      .eq("is_active", true)
      .maybeSingle<{ model_id: string }>();
    return !!data;
  },

  async list(orgId: string): Promise<AgentcoreAgentRow[]> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("agents")
      .select(SELECT_COLS)
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .returns<AgentcoreAgentRow[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async get(orgId: string, id: string): Promise<AgentcoreAgentRow | null> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("agents")
      .select(SELECT_COLS)
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<AgentcoreAgentRow>();
    if (error) throw new Error(error.message);
    return data ?? null;
  },

  async create(input: AgentcoreAgentInsert): Promise<MutationResult> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("agents")
      .insert({
        org_id: input.org_id,
        name: input.name,
        model: input.model,
        system_prompt: input.system_prompt ?? null,
        tools: input.tools ?? [],
        memory_policy: input.memory_policy ?? {},
        guardrail: input.guardrail ?? "warn",
        max_steps: input.max_steps ?? 12,
        max_cost_cents: input.max_cost_cents ?? 100,
        created_by: input.created_by,
      })
      .select(SELECT_COLS)
      .single<AgentcoreAgentRow>();
    if (error) return { success: false, code: error.code, error: error.message };
    return { success: true, data };
  },

  /** Org-scoped update. Returns success:false with no data if the row doesn't
   *  belong to the org (or doesn't exist). */
  async update(
    orgId: string,
    id: string,
    patch: AgentcoreAgentUpdate
  ): Promise<MutationResult> {
    // Drop undefined keys so we only write provided fields.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;

    const { data, error } = await client()
      .schema("agentcore")
      .from("agents")
      .update(clean)
      .eq("org_id", orgId)
      .eq("id", id)
      .select(SELECT_COLS)
      .maybeSingle<AgentcoreAgentRow>();
    if (error) return { success: false, code: error.code, error: error.message };
    if (!data) return { success: false, error: "not_found" };
    return { success: true, data };
  },

  /** Hard delete, org-scoped. Runs reference agent_id ON DELETE SET NULL, so a
   *  delete never orphans run history. */
  async remove(orgId: string, id: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("agents")
      .delete()
      .eq("org_id", orgId)
      .eq("id", id)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "not_found" };
    return { success: true };
  },
};

// ── Runs (durable invocations) — control-plane read + dashboard-initiated create ─

export interface RunListItem {
  id: string;
  agent_id: string | null;
  // Which credential started this run — null means the dashboard itself
  // (session-authed playground/run button), not an API key at all. Doc 15's
  // access-key feature makes this genuinely useful: an agent bound to both a
  // private backend key and a public widget key needs to distinguish "my own
  // testing" from "real external traffic" in its run history.
  api_key_id: string | null;
  status: string;
  cost_cents: number;
  step_count: number;
  created_at: string;
  updated_at: string;
}

export interface RunStepRow {
  step_index: number;
  step_type: string;
  tool_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  units: number | null;
  unit_label: string | null;
  cost_cents: number;
  latency_ms: number | null;
  status: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface RunDetail extends RunListItem {
  output: Record<string, unknown> | null;
  error: string | null;
  max_cost_cents: number;
  steps: RunStepRow[];
}

export interface CreateRunInput {
  org_id: string;
  agent_id: string | null;
  billing_user_id: string;
  input: Record<string, unknown>;
  max_cost_cents: number;
  previous_response_id: string | null;
}

/** Resolve the org's payer (billing_user_id) — the identity a run bills to. */
export async function orgPayer(orgId: string): Promise<string | null> {
  const { data } = await client()
    .schema("inference")
    .from("orgs")
    .select("billing_user_id")
    .eq("id", orgId)
    .maybeSingle<{ billing_user_id: string }>();
  return data?.billing_user_id ?? null;
}

/**
 * Org monthly hard-cap check — mirrors the gateway's spendCheckMiddleware so the
 * dashboard run path can't bypass the ceiling the API path enforces.
 *
 * Returns true when the org has a hard cap set and this month's spend has reached
 * it (→ the caller should refuse with 402). Orgs with no cap (the common case,
 * incl. fresh/test orgs) short-circuit to false without summing usage. Uses the
 * authoritative inference.usage sum (the gateway uses the eventually-consistent
 * KV counter for the hot path; same rule, same table of record).
 */
export async function orgHardCapReached(orgId: string): Promise<boolean> {
  const c = client();
  const { data: org } = await c
    .schema("inference")
    .from("orgs")
    .select("hard_cap_cents")
    .eq("id", orgId)
    .maybeSingle<{ hard_cap_cents: number | null }>();

  const cap = org?.hard_cap_cents ?? null;
  if (!cap || cap <= 0) return false; // no cap configured → never blocks

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: rows } = await c
    .schema("inference")
    .from("usage")
    .select("cost_cents")
    .eq("org_id", orgId)
    .gte("created_at", monthStart.toISOString())
    .returns<{ cost_cents: number }[]>();

  const spentCents = (rows ?? []).reduce((sum, r) => sum + Number(r.cost_cents ?? 0), 0);
  return spentCents >= cap;
}

export const AgentcoreRuns = {
  async list(orgId: string, opts: { agentId?: string; limit?: number } = {}): Promise<RunListItem[]> {
    let q = client()
      .schema("agentcore")
      .from("runs")
      .select("id, agent_id, api_key_id, status, cost_cents, step_count, created_at, updated_at")
      .eq("org_id", orgId);
    if (opts.agentId) q = q.eq("agent_id", opts.agentId);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 50)
      .returns<RunListItem[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** Full run + ordered step trace, org-scoped. Null if not this org's run. */
  async getWithSteps(orgId: string, id: string): Promise<RunDetail | null> {
    const { data: run, error } = await client()
      .schema("agentcore")
      .from("runs")
      .select("id, agent_id, status, cost_cents, step_count, max_cost_cents, output, error, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<Omit<RunDetail, "steps">>();
    if (error) throw new Error(error.message);
    if (!run) return null;

    const { data: steps } = await client()
      .schema("agentcore")
      .from("run_steps")
      .select("step_index, step_type, tool_name, input_tokens, output_tokens, units, unit_label, cost_cents, latency_ms, status, detail, created_at")
      .eq("run_id", id)
      .order("step_index", { ascending: true })
      .returns<RunStepRow[]>();

    return { ...run, steps: steps ?? [] };
  },

  async create(input: CreateRunInput): Promise<{ success: boolean; id?: string; error?: string }> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("runs")
      .insert({
        org_id: input.org_id,
        agent_id: input.agent_id,
        billing_user_id: input.billing_user_id,
        status: "queued",
        input: input.input,
        max_cost_cents: input.max_cost_cents,
        previous_response_id: input.previous_response_id,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { success: false, error: error?.message ?? "insert failed" };
    return { success: true, id: data.id };
  },

  /**
   * Session-authed counterpart to the api-key gateway's POST /v1/agents/
   * runs/:id/cancel (workers/inference/src/routes/agent-runs.ts) — same
   * atomic transition, no dashboard route existed to reach it before (doc:
   * "whole agent UI" gap review, 2026-07-08). Only a non-terminal run flips;
   * an already-terminal run is a no-op that just reports its real status,
   * not an error — cancelling a run that finished a second ago shouldn't
   * look like a failure to the person who clicked the button.
   */
  async cancel(orgId: string, runId: string): Promise<{ success: boolean; status?: string; error?: string }> {
    const { data: won } = await client()
      .schema("agentcore")
      .from("runs")
      .update({ status: "cancelled" })
      .eq("id", runId)
      .eq("org_id", orgId)
      .in("status", ["queued", "running", "requires_action"])
      .select("id")
      .maybeSingle<{ id: string }>();

    if (won) return { success: true, status: "cancelled" };

    const { data: existing } = await client()
      .schema("agentcore")
      .from("runs")
      .select("status")
      .eq("id", runId)
      .eq("org_id", orgId)
      .maybeSingle<{ status: string }>();

    if (!existing) return { success: false, error: "not_found" };
    return { success: true, status: existing.status };
  },
};

// ── Agent memory (S5) — control-plane purge (DPDP/GDPR right-to-erasure) ───────

export const AgentcoreMemories = {
  /** Delete ALL of an agent's stored memories, org-scoped. Returns the count removed. */
  async purgeForAgent(
    orgId: string,
    agentId: string
  ): Promise<{ success: boolean; purged?: number; error?: string }> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("agent_memories")
      .delete()
      .eq("org_id", orgId)
      .eq("agent_id", agentId)
      .select("id");
    if (error) return { success: false, error: error.message };
    return { success: true, purged: data?.length ?? 0 };
  },
};

// ── MCP servers registry (M3, doc 14 §4) — control-plane metadata only ────────
// Encryption/decryption of auth_token happens in the ROUTE (mirrors byok-keys),
// not here — this module just stores/reads whatever ciphertext it's given.

/** Masked row shape for list/read responses — auth_token_enc / oauth_client_secret_enc
 *  / oauth_access_token_enc / oauth_refresh_token_enc are NEVER returned. */
export interface AgentcoreMcpServerRow {
  id: string;
  org_id: string | null;
  slug: string;
  display_name: string;
  server_url: string;
  auth_type: "static" | "oauth";
  has_token: boolean; // derived: auth_token_enc IS NOT NULL, never the ciphertext itself
  oauth_client_id: string | null;
  oauth_status: "pending" | "connected" | "error" | null;
  oauth_last_error: string | null;
  allowed_tools: string[];
  visibility: "private" | "curated";
  status: "active" | "error" | "disabled";
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentcoreMcpServerInsert {
  org_id: string;
  slug: string;
  display_name: string;
  server_url: string;
  auth_type?: "static" | "oauth";
  auth_token_enc?: string | null; // pre-encrypted (bytea hex), or absent
  oauth_client_id?: string | null;
  oauth_client_secret_enc?: string | null;
  oauth_scope?: string | null;
  allowed_tools?: string[];
}

/** slug/visibility/auth_type deliberately excluded — see AgentcoreMcpServers.update(). */
export interface AgentcoreMcpServerUpdate {
  display_name?: string;
  server_url?: string;
  auth_token_enc?: string | null;
  oauth_client_id?: string;
  oauth_client_secret_enc?: string | null;
  oauth_scope?: string | null;
  allowed_tools?: string[];
}

interface McpServerDbRow {
  id: string;
  org_id: string | null;
  slug: string;
  auth_type: "static" | "oauth";
  oauth_client_id: string | null;
  oauth_status: "pending" | "connected" | "error" | null;
  oauth_last_error: string | null;
  display_name: string;
  server_url: string;
  auth_token_enc: string | null;
  allowed_tools: string[];
  visibility: "private" | "curated";
  status: "active" | "error" | "disabled";
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function maskMcpServer(row: McpServerDbRow): AgentcoreMcpServerRow {
  return {
    id: row.id,
    org_id: row.org_id,
    slug: row.slug,
    display_name: row.display_name,
    server_url: row.server_url,
    auth_type: row.auth_type,
    has_token: row.auth_token_enc != null,
    oauth_client_id: row.oauth_client_id,
    oauth_status: row.oauth_status,
    oauth_last_error: row.oauth_last_error,
    allowed_tools: row.allowed_tools ?? [],
    visibility: row.visibility,
    status: row.status,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const MCP_SERVER_COLS =
  "id, org_id, slug, display_name, server_url, auth_type, auth_token_enc, oauth_client_id, oauth_status, oauth_last_error, allowed_tools, visibility, status, last_error, created_at, updated_at";

export interface McpServerMutationResult {
  success: boolean;
  data?: AgentcoreMcpServerRow;
  /** Postgres error code when relevant (e.g. "23505" unique violation). */
  code?: string;
  error?: string;
}

export const AgentcoreMcpServers = {
  /** Org's own servers PLUS the platform-curated catalog (org_id IS NULL). */
  async list(orgId: string): Promise<AgentcoreMcpServerRow[]> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("mcp_servers")
      .select(MCP_SERVER_COLS)
      .or(`org_id.eq.${orgId},org_id.is.null`)
      // Org's own ('private') servers first, curated catalog last — 'private' >
      // 'curated' alphabetically, so this needs DESCENDING, not ascending (a
      // bug caught on review: ascending actually sorted curated first).
      .order("visibility", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<McpServerDbRow[]>();
    if (error) throw new Error(error.message);
    return (data ?? []).map(maskMcpServer);
  },

  /** Register once, org-scoped (org_id NOT NULL — customers only ever create
   *  'private' rows; 'curated' rows are seeded separately, M4). */
  async create(input: AgentcoreMcpServerInsert): Promise<McpServerMutationResult> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("mcp_servers")
      .insert({
        org_id: input.org_id,
        slug: input.slug,
        display_name: input.display_name,
        server_url: input.server_url,
        auth_type: input.auth_type ?? "static",
        auth_token_enc: input.auth_token_enc ?? null,
        oauth_client_id: input.oauth_client_id ?? null,
        oauth_client_secret_enc: input.oauth_client_secret_enc ?? null,
        oauth_scope: input.oauth_scope ?? null,
        // A freshly-registered oauth server has no tokens yet — 'pending'
        // until the customer completes the authorize→callback consent flow.
        oauth_status: input.auth_type === "oauth" ? "pending" : null,
        allowed_tools: input.allowed_tools ?? [],
        visibility: "private",
      })
      .select(MCP_SERVER_COLS)
      .single<McpServerDbRow>();
    if (error) return { success: false, code: error.code, error: error.message };
    return { success: true, data: maskMcpServer(data) };
  },

  /** Org-scoped update — slug and visibility are intentionally NOT editable
   *  here: the slug is the stable bind-key agents reference by
   *  `{server_slug}`, so changing it would silently break every agent bound
   *  to it; visibility is platform-controlled (curated rows aren't reachable
   *  through this org-scoped query anyway). `auth_token_enc` is only set when
   *  the caller actually re-encrypted a new token (route decides that). */
  async update(orgId: string, id: string, patch: AgentcoreMcpServerUpdate): Promise<McpServerMutationResult> {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;

    const { data, error } = await client()
      .schema("agentcore")
      .from("mcp_servers")
      .update(clean)
      .eq("org_id", orgId)
      .eq("id", id)
      .select(MCP_SERVER_COLS)
      .maybeSingle<McpServerDbRow>();
    if (error) return { success: false, code: error.code, error: error.message };
    if (!data) return { success: false, error: "not_found" };
    return { success: true, data: maskMcpServer(data) };
  },

  /** Unmasked read for the OAuth authorize/callback routes ONLY — the only
   *  two places in the app that legitimately need oauth_client_id +
   *  the encrypted client secret (to build client info for the token
   *  exchange). Every other caller goes through list/create/update's masked
   *  shape. Org-scoped like every other query here. */
  async getForOAuthFlow(
    orgId: string,
    id: string
  ): Promise<{
    id: string;
    slug: string;
    server_url: string;
    auth_type: "static" | "oauth";
    oauth_client_id: string | null;
    oauth_client_secret_enc: string | null;
    oauth_scope: string | null;
    oauth_authorization_server_url: string | null;
    oauth_resource_metadata: unknown;
  } | null> {
    const { data } = await client()
      .schema("agentcore")
      .from("mcp_servers")
      .select(
        "id, slug, server_url, auth_type, oauth_client_id, oauth_client_secret_enc, oauth_scope, oauth_authorization_server_url, oauth_resource_metadata"
      )
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle();
    return data ?? null;
  },

  /** Persists the result of a completed (or failed) OAuth token exchange —
   *  called only by the /oauth/callback route. Caches the discovered
   *  authorization-server URL + resource metadata so a later refresh doesn't
   *  need to re-run RFC 9728/8414 discovery. */
  async saveOAuthTokens(
    orgId: string,
    id: string,
    patch: {
      oauth_access_token_enc: string | null;
      oauth_refresh_token_enc: string | null;
      oauth_token_expires_at: string | null;
      oauth_authorization_server_url?: string;
      oauth_resource_metadata?: unknown;
      oauth_status: "connected" | "error";
      oauth_last_error: string | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await client()
      .schema("agentcore")
      .from("mcp_servers")
      .update(patch)
      .eq("org_id", orgId)
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  /** Hard delete, org-scoped — a curated (org_id NULL) row can never match, so
   *  no customer can delete a platform row through this org-scoped query. */
  async remove(orgId: string, id: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await client()
      .schema("agentcore")
      .from("mcp_servers")
      .delete()
      .eq("org_id", orgId)
      .eq("id", id)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "not_found" };
    return { success: true };
  },
};
