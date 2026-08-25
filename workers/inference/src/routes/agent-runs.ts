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
  detail: Record<string, unknown> | null;
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
      "step_index, step_type, tool_name, input_tokens, output_tokens, units, unit_label, cost_cents, latency_ms, status, detail, created_at"
    )
    .eq("run_id", runId)
    .gt("step_index", afterIndex)
    .order("step_index", { ascending: true })
    .returns<StepRow[]>();
  return data ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GetRunResponse {
  id: string;
  object: "response";
  status: string;
  error: string | null;
  cost_cents: number;
  step_count: number;
  created_at: string;
  updated_at: string;
  output: Record<string, unknown> | null;
  steps: StepRow[];
}

/** What a public-tier key gets back — cost_cents/step_count/steps keys are
 *  absent entirely (not zeroed — a 0 would misleadingly read as "this run
 *  cost nothing" rather than "this data isn't visible to this key"). `output`
 *  is collapsed to just the reply text, NOT the internal Responses-API
 *  envelope private callers get (see extractFinalText's doc comment for why
 *  that envelope itself isn't safe to pass through as-is). */
type RedactedRunResponse = Omit<GetRunResponse, "cost_cents" | "step_count" | "steps" | "output"> & {
  output: { text: string | null } | null;
};

/** Generic enough to be useless to an attacker, specific enough to be
 *  useful to a real visitor deciding whether to retry. */
const PUBLIC_ERROR_MESSAGE = "The agent could not complete this request.";

/**
 * Found live testing this exact redaction against a real run (2026-07-08):
 * `run.output` — the internal Responses-API-shaped object agent-runner's
 * finalizeCompleted() writes (workers/agent-runner/src/lifecycle.ts) — embeds
 * its OWN cost/step metering fields as siblings of the actual reply:
 * `{ output: [...], usage: {...}, steps: N, x_ahura_cost_cents: X }`. The
 * first redaction pass only stripped the wrapper's cost_cents/step_count/
 * steps and passed `run.output` through untouched — so a public key still
 * got the real cost via `output.x_ahura_cost_cents` and step count via
 * `output.steps`. A strip-list (deleting known-bad keys from that object)
 * would only be as safe as this file staying in sync with every future field
 * agent-runner ever adds to that envelope. An allow-list is the only version
 * of this that can't silently regress: extract just the reply text, return
 * nothing else, so a new internal field showing up in `output` tomorrow is
 * simply never looked at, rather than something someone has to remember to
 * also redact.
 */
export function extractFinalText(output: Record<string, unknown> | null): string | null {
  if (!output) return null;
  const items = Array.isArray(output.output) ? output.output : [];
  for (const item of items) {
    if (item && typeof item === "object" && Array.isArray((item as { content?: unknown }).content)) {
      const content = (item as { content: unknown[] }).content;
      const textPart = content.find((c) => typeof (c as { text?: unknown })?.text === "string");
      if (textPart) return (textPart as { text: string }).text;
    }
  }
  return null;
}

/**
 * Public-tier keys (doc: manager ask 2026-07-08) are designed to be embedded
 * in a customer's website JS — anyone visiting that site can open devtools
 * and read this response, so it must never carry cost_cents, per-step
 * tool-call internals, or the internal response envelope's own metering
 * fields (see extractFinalText). A private key gets the untouched, full
 * response.
 *
 * Also redacts `error` to a generic message on a failed run — found on
 * review: the raw internal error string (e.g. real ones seen live in this
 * codebase like "TypeError: fetch failed") can carry implementation details
 * (stack traces, DB error text) that shouldn't reach an anonymous website
 * visitor either, same principle as the cost/step redaction, just easy to
 * miss since it isn't a "metering" field.
 *
 * Pure so it's unit-testable without a Hono context.
 */
export function redactForPublicTier(
  run: GetRunResponse,
  isPublic: boolean
): GetRunResponse | RedactedRunResponse {
  if (!isPublic) return run;
  const { cost_cents: _cost, step_count: _steps, steps: _stepsArr, output: _output, ...redacted } = run;
  return {
    ...redacted,
    error: redacted.error ? PUBLIC_ERROR_MESSAGE : null,
    output: run.output ? { text: extractFinalText(run.output) } : null,
  };
}

// ── GET /v1/agents/runs/:id ───────────────────────────────────────────────────

export const getAgentRun: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id) {
    return c.json(gatewayError("Missing run id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  let runQuery = supabase
    .schema("agentcore")
    .from("runs")
    .select("id, status, output, cost_cents, step_count, error, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", auth.orgId);
  // Agent-scoped key (doc: manager ask 2026-07-08) — a run belonging to a
  // DIFFERENT agent in the same org must 404, not just leak by org_id alone.
  if (auth.agentId) runQuery = runQuery.eq("agent_id", auth.agentId);

  const { data: run } = await runQuery.maybeSingle<{
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

  const response: GetRunResponse = {
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
  };
  return c.json(redactForPublicTier(response, auth.keyTier === "public"));
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

  let streamRunQuery = supabase
    .schema("agentcore")
    .from("runs")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", auth.orgId);
  if (auth.agentId) streamRunQuery = streamRunQuery.eq("agent_id", auth.agentId);

  const { data: run } = await streamRunQuery.maybeSingle<{ id: string; status: string }>();

  if (!run) {
    return c.json(gatewayError("Run not found", "invalid_request_error", "run_not_found", requestId), 404);
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "response.created",
      data: JSON.stringify({ response: { id, status: run.status } }),
    });

    const isPublic = auth.keyTier === "public";
    let lastIndex = -1;
    for (let i = 0; i < STREAM_MAX_ITERS; i++) {
      const steps = await fetchSteps(supabase, id, lastIndex);
      for (const step of steps) {
        // Public tier (doc: manager ask 2026-07-08): never stream per-step
        // tool-call internals to a browser — only the terminal events below.
        if (!isPublic) {
          await stream.writeSSE({ event: "response.step.added", data: JSON.stringify({ step }) });
        }
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
          // Same redaction as getAgentRun (redactForPublicTier) — cur.output
          // is the internal Responses-API envelope, which embeds its own
          // cost/step fields (x_ahura_cost_cents, steps) as siblings of the
          // reply text. A public key gets ONLY the extracted text, never
          // that envelope, for the same allow-list reasoning documented on
          // extractFinalText.
          const response = isPublic
            ? { text: extractFinalText(cur.output) }
            : (cur.output ?? { id, status: cur.status });
          await stream.writeSSE({
            event: "response.completed",
            data: JSON.stringify({ response }),
          });
        } else {
          // Same redaction as getAgentRun — a public key never gets the raw
          // internal error string (see redactForPublicTier's doc comment).
          const error = isPublic && cur.error ? PUBLIC_ERROR_MESSAGE : cur.error;
          await stream.writeSSE({
            event: "response.failed",
            data: JSON.stringify({ response: { id, status: cur.status, error } }),
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
  let cancelQuery = supabase
    .schema("agentcore")
    .from("runs")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .in("status", ["queued", "running", "requires_action"]);
  if (auth.agentId) cancelQuery = cancelQuery.eq("agent_id", auth.agentId);

  const { data: won } = await cancelQuery.select("id").maybeSingle<{ id: string }>();

  if (won) {
    return c.json({ id, object: "response", status: "cancelled" });
  }

  // Either terminal already (no-op) or not ours / missing.
  let existingQuery = supabase
    .schema("agentcore")
    .from("runs")
    .select("status")
    .eq("id", id)
    .eq("org_id", auth.orgId);
  if (auth.agentId) existingQuery = existingQuery.eq("agent_id", auth.agentId);

  const { data: existing } = await existingQuery.maybeSingle<{ status: string }>();

  if (!existing) {
    return c.json(gatewayError("Run not found", "invalid_request_error", "run_not_found", requestId), 404);
  }
  return c.json({ id, object: "response", status: existing.status });
};
