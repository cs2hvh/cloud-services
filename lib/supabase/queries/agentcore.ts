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
      .select("id, agent_id, status, cost_cents, step_count, created_at, updated_at")
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
};
