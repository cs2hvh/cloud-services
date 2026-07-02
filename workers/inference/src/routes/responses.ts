/**
 * POST /v1/responses            — stateful auto tool-loop (durable → 202 + run_id)
 * POST /v1/agents/:id/runs      — durable run for a defined agent (→ 202 + run_id)
 *
 * v1 is DURABLE-ONLY (§6): the gateway is thin — validate → (auth/spend/ratelimit
 * already applied by the v1 middleware chain) → resolve config → insert a queued
 * agentcore.runs row → 202. The agent-runner's claimer polls Postgres and executes
 * the loop; there is no inline-in-Worker path and no BullMQ enqueue here.
 *
 * Spend: the hard-cap 402 is enforced by spendCheckMiddleware BEFORE this handler
 * runs, so a capped org never inserts a run. Full prepaid-balance pre-flight
 * (estimateMaxCost / hasSufficientBalance) is wired with Phase-0 billing hardening
 * — nothing agent-related charges money until then (§9).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import type { AuthContext } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";

// ── Validation ────────────────────────────────────────────────────────────────

const toolSchema = z.object({ type: z.string() }).passthrough();

/** POST /v1/responses body. Either agent_id OR an inline (model + max_cost_cents). */
export const responsesSchema = z
  .object({
    agent_id: z.string().uuid().optional(),
    model: z.string().min(1).optional(),
    system_prompt: z.string().optional(),
    tools: z.array(toolSchema).optional(),
    input: z.union([z.string().min(1), z.array(z.record(z.unknown())).min(1)]),
    previous_response_id: z.string().uuid().optional(),
    max_steps: z.number().int().min(1).max(100).optional(),
    max_cost_cents: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
  })
  .refine((d) => d.agent_id || d.model, {
    message: "Either agent_id or model is required",
  })
  .refine((d) => d.agent_id || d.max_cost_cents != null, {
    message: "max_cost_cents is required when no agent_id is provided",
  });

/** POST /v1/agents/:id/runs body — agent supplies model/budget, so just input. */
export const agentRunSchema = z.object({
  input: z.union([z.string().min(1), z.array(z.record(z.unknown())).min(1)]),
  previous_response_id: z.string().uuid().optional(),
  stream: z.boolean().optional(),
});

export type ResponsesBody = z.infer<typeof responsesSchema>;

function makeSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Resolve the org's payer (billing_user_id) — the "resolved at create" identity
 *  the runner/settle path bills. */
async function resolveOrgPayer(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .schema("inference")
    .from("orgs")
    .select("billing_user_id")
    .eq("id", orgId)
    .maybeSingle<{ billing_user_id: string }>();
  return data?.billing_user_id ?? null;
}

interface EnqueueInput {
  agentId: string | null;
  /** Full request payload stored on the run so the runner has everything. */
  storedInput: Record<string, unknown>;
  previousResponseId: string | null;
}

/**
 * Shared enqueue path for both entrypoints. Resolves the cost ceiling (from the
 * stored agent or the inline request), the org payer, and inserts a queued run.
 * Returns the created run id or a typed error.
 */
async function enqueueRun(
  c: Parameters<Handler<{ Bindings: Env; Variables: HonoVariables }>>[0],
  input: EnqueueInput,
  inlineMaxCostCents: number | null
): Promise<{ ok: true; runId: string } | { ok: false; status: 402 | 404 | 500; body: unknown }> {
  const auth = c.get("auth") as AuthContext;
  const requestId = c.get("requestId") as string;
  const supabase = makeSupabase(c.env);

  let maxCostCents = inlineMaxCostCents;

  if (input.agentId) {
    const { data: agent } = await supabase
      .schema("agentcore")
      .from("agents")
      .select("id, max_cost_cents, is_active")
      .eq("id", input.agentId)
      .eq("org_id", auth.orgId)
      .eq("is_active", true)
      .maybeSingle<{ id: string; max_cost_cents: number; is_active: boolean }>();
    if (!agent) {
      return {
        ok: false,
        status: 404,
        body: gatewayError("Agent not found", "invalid_request_error", "agent_not_found", requestId),
      };
    }
    maxCostCents = agent.max_cost_cents;
  }

  if (maxCostCents == null) {
    // Defensive — validation should already guarantee this.
    return {
      ok: false,
      status: 404,
      body: gatewayError("Unable to resolve cost ceiling", "invalid_request_error", "invalid_request", requestId),
    };
  }

  const payer = await resolveOrgPayer(supabase, auth.orgId);
  if (!payer) {
    return {
      ok: false,
      status: 500,
      body: gatewayError("Unable to resolve billing account", "server_error", "billing_unresolved", requestId),
    };
  }

  const { data: run, error } = await supabase
    .schema("agentcore")
    .from("runs")
    .insert({
      org_id: auth.orgId,
      agent_id: input.agentId,
      api_key_id: auth.keyId,
      billing_user_id: payer,
      previous_response_id: input.previousResponseId,
      status: "queued",
      input: input.storedInput,
      max_cost_cents: maxCostCents,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !run) {
    return {
      ok: false,
      status: 500,
      body: gatewayError("Failed to create run", "server_error", "run_create_failed", requestId),
    };
  }

  return { ok: true, runId: run.id };
}

function accepted(runId: string) {
  return { id: runId, object: "response" as const, status: "queued" as const };
}

// ── POST /v1/responses ────────────────────────────────────────────────────────

export const responses: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const requestId = c.get("requestId");

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = responsesSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const body = parsed.data;

  const result = await enqueueRun(
    c,
    {
      agentId: body.agent_id ?? null,
      storedInput: body as Record<string, unknown>,
      previousResponseId: body.previous_response_id ?? null,
    },
    body.max_cost_cents ?? null
  );
  if (!result.ok) return c.json(result.body, result.status);

  return c.json(accepted(result.runId), 202);
};

// ── POST /v1/agents/:id/runs ──────────────────────────────────────────────────

export const createAgentRun: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const requestId = c.get("requestId");
  const agentId = c.req.param("id");
  if (!agentId) {
    return c.json(gatewayError("Missing agent id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }

  const parsed = agentRunSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        "invalid_request_error",
        "invalid_request",
        requestId
      ),
      400
    );
  }
  const body = parsed.data;

  const result = await enqueueRun(
    c,
    {
      agentId,
      storedInput: body as Record<string, unknown>,
      previousResponseId: body.previous_response_id ?? null,
    },
    null // ceiling comes from the agent row
  );
  if (!result.ok) return c.json(result.body, result.status);

  return c.json(accepted(result.runId), 202);
};
