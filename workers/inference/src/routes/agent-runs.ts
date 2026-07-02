/**
 * GET  /v1/agents/runs/:id          — run status + full step trace (org-scoped)
 * GET  /v1/agents/runs/:id/stream   — SSE: replay + tail step events until terminal
 * POST /v1/agents/runs/:id/cancel   — atomic transition to cancelled if not terminal
 *
 * These read/tail the durable run the agent-runner executes. All are org-scoped
 * via the authed key's orgId — another org's run id resolves to 404, never a leak.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { streamSSE } from "hono/streaming";
import type { Env, HonoVariables } from "../types.ts";
import { gatewayError } from "../lib/gateway.ts";

const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);
// Bounded SSE tail — respects Worker wall-clock limits. Clients reconnect (or
// fall back to GET polling) if a very long run outlives one stream window.
const STREAM_MAX_ITERS = 150;
const STREAM_POLL_MS = 1000;

interface StepRow {
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
  created_at: string;
}

function makeSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function fetchSteps(
  supabase: SupabaseClient,
  runId: string,
  afterIndex: number
): Promise<StepRow[]> {
  const { data } = await supabase
    .schema("agentcore")
    .from("run_steps")
    .select(
      "step_index, step_type, tool_name, input_tokens, output_tokens, units, unit_label, cost_cents, latency_ms, status, created_at"
    )
    .eq("run_id", runId)
    .gt("step_index", afterIndex)
    .order("step_index", { ascending: true })
    .returns<StepRow[]>();
  return data ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── GET /v1/agents/runs/:id ───────────────────────────────────────────────────

export const getAgentRun: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(gatewayError("Missing run id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data: run } = await supabase
    .schema("agentcore")
    .from("runs")
    .select("id, status, output, cost_cents, step_count, error, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{
      id: string;
      status: string;
      output: Record<string, unknown> | null;
      cost_cents: number;
      step_count: number;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>();

  if (!run) {
    return c.json(gatewayError("Run not found", "invalid_request_error", "run_not_found", requestId), 404);
  }

  const steps = await fetchSteps(supabase, id, -1);

  return c.json({
    id: run.id,
    object: "response",
    status: run.status,
    error: run.error,
    cost_cents: run.cost_cents,
    step_count: run.step_count,
    created_at: run.created_at,
    updated_at: run.updated_at,
    output: run.output,
    steps,
  });
};

// ── GET /v1/agents/runs/:id/stream (SSE) ──────────────────────────────────────

export const streamAgentRun: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(gatewayError("Missing run id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data: run } = await supabase
    .schema("agentcore")
    .from("runs")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string; status: string }>();

  if (!run) {
    return c.json(gatewayError("Run not found", "invalid_request_error", "run_not_found", requestId), 404);
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "response.created",
      data: JSON.stringify({ response: { id, status: run.status } }),
    });

    let lastIndex = -1;
    for (let i = 0; i < STREAM_MAX_ITERS; i++) {
      const steps = await fetchSteps(supabase, id, lastIndex);
      for (const step of steps) {
        await stream.writeSSE({ event: "response.step.added", data: JSON.stringify({ step }) });
        lastIndex = step.step_index;
      }

      const { data: cur } = await supabase
        .schema("agentcore")
        .from("runs")
        .select("status, output, error")
        .eq("id", id)
        .maybeSingle<{ status: string; output: Record<string, unknown> | null; error: string | null }>();

      if (cur && TERMINAL.has(cur.status)) {
        if (cur.status === "completed") {
          await stream.writeSSE({
            event: "response.completed",
            data: JSON.stringify({ response: cur.output ?? { id, status: cur.status } }),
          });
        } else {
          await stream.writeSSE({
            event: "response.failed",
            data: JSON.stringify({ response: { id, status: cur.status, error: cur.error } }),
          });
        }
        return;
      }

      await sleep(STREAM_POLL_MS);
    }
    // Window exhausted without terminal — client reconnects or polls GET.
  });
};

// ── POST /v1/agents/runs/:id/cancel ───────────────────────────────────────────

export const cancelAgentRun: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(gatewayError("Missing run id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  // Win the transition atomically — only a non-terminal run flips to cancelled.
  const { data: won } = await supabase
    .schema("agentcore")
    .from("runs")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .in("status", ["queued", "running", "requires_action"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (won) {
    return c.json({ id, object: "response", status: "cancelled" });
  }

  // Either terminal already (no-op) or not ours / missing.
  const { data: existing } = await supabase
    .schema("agentcore")
    .from("runs")
    .select("status")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ status: string }>();

  if (!existing) {
    return c.json(gatewayError("Run not found", "invalid_request_error", "run_not_found", requestId), 404);
  }
  return c.json({ id, object: "response", status: existing.status });
};
