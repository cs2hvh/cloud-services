/**
 * Shared between the top-level run executor (lifecycle.ts) and the nested
 * delegated-run executor (tools/agent-delegate.ts) — both drive one
 * `runAgentLoop` against `agentcore.runs`/`run_steps` and need the exact same
 * pricing math, step-persistence write, and cancellation check. Extracted
 * (2026-07-17) after a duplication review found these four pieces byte-for-
 * byte (or near enough) duplicated in both files — a real drift risk, since
 * e.g. a new `agent/*` tool-rate key or a pricing formula change would
 * otherwise need to be remembered in two places.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoopStep } from "@ahura/agent-core";

export interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
}

/** cents-per-unit for each hosted-tool unit_label (from the agent/* catalog rows). */
export type ToolRates = Record<string, number>;

/** Maps a hosted-tool pricing row's `cents_per_*` key to its metering unit_label. */
const TOOL_PRICE_KEY_TO_LABEL: Record<string, string> = {
  cents_per_web_search: "web_search",
  cents_per_function_call: "function_call",
  cents_per_cpu_second: "cpu_second",
  cents_per_file_search: "file_search",
  cents_per_memory_write: "memory_write",
  cents_per_memory_search: "memory_search",
  cents_per_mcp_call: "mcp_call",
};

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export async function fetchModelPricing(supabase: SupabaseClient, model: string): Promise<ModelPricing> {
  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("pricing")
    .eq("model_id", model)
    .maybeSingle<{ pricing: ModelPricing }>();
  return data?.pricing ?? {};
}

/**
 * Load per-unit tool rates from the internal `agent/*` catalog rows so tool steps
 * count toward the mid-run cost ceiling (§9). Placeholder rates PENDING_FINANCE —
 * but the guard must sum tool spend regardless, else an agent that only calls
 * expensive tools (never re-invoking the model) could run past its budget.
 */
export async function fetchToolRates(supabase: SupabaseClient): Promise<ToolRates> {
  const { data } = await supabase.schema("inference").from("models").select("pricing").like("model_id", "agent/%");
  const rates: ToolRates = {};
  for (const row of (data ?? []) as Array<{ pricing: Record<string, number> | null }>) {
    for (const [key, cents] of Object.entries(row.pricing ?? {})) {
      const label = TOOL_PRICE_KEY_TO_LABEL[key];
      if (label && typeof cents === "number") rates[label] = cents;
    }
  }
  return rates;
}

/** Fractional cents for one step — model steps by token pricing, tool steps by
 *  `units × per-unit rate`. Kept precise for the ceiling comparison; the
 *  authoritative billed amount comes from the usage pipeline later. */
export function priceStep(step: LoopStep, pricing: ModelPricing, toolRates: ToolRates): number {
  if (step.stepType === "model") {
    const inRate = pricing.input_cents_per_mtok ?? 0;
    const outRate = pricing.output_cents_per_mtok ?? 0;
    return ((step.inputTokens ?? 0) * inRate) / 1_000_000 + ((step.outputTokens ?? 0) * outRate) / 1_000_000;
  }
  const label = step.metering?.unitLabel;
  const units = step.metering?.units ?? 0;
  const rate = label ? toolRates[label] ?? 0 : 0;
  return units * rate;
}

/** Write one step's trace row. Throws on failure rather than swallowing it —
 *  found live (2026-07-08): a missing sequence grant once made every
 *  run_steps insert fail unnoticed, leaving a "completed" run with a silently
 *  empty trace and no per-step usage. Callers let this propagate out of
 *  their `onStep` so the run fails loudly instead. */
export async function insertRunStep(supabase: SupabaseClient, runId: string, orgId: string, step: LoopStep): Promise<void> {
  const { error } = await supabase.schema("agentcore").from("run_steps").insert({
    run_id: runId,
    org_id: orgId,
    step_index: step.stepIndex,
    step_type: step.stepType,
    tool_name: step.toolName ?? null,
    input_tokens: step.inputTokens ?? null,
    output_tokens: step.outputTokens ?? null,
    units: step.metering?.units ?? null,
    unit_label: step.metering?.unitLabel ?? null,
    cost_cents: round4(step.costCents ?? 0),
    latency_ms: step.latencyMs ?? null,
    status: step.status,
    detail: step.detail ?? null,
  });
  if (error) throw new Error(`persist run_step ${step.stepIndex} failed: ${error.message}`);
}

export async function isRunCancelled(supabase: SupabaseClient, runId: string): Promise<boolean> {
  const { data } = await supabase
    .schema("agentcore")
    .from("runs")
    .select("status")
    .eq("id", runId)
    .maybeSingle<{ status: string }>();
  return data?.status === "cancelled";
}

/** Write the completed-run summary (output envelope + totals) — identical
 *  shape for a top-level run and a delegated sub-run, since both are just
 *  `agentcore.runs` rows driven by the same `runAgentLoop`. Guarded against
 *  clobbering a cancellation that landed mid-flight: found live (2026-07-08)
 *  — the single-step common case has no re-check between "model call in
 *  flight" and "write completed", so a cancel arriving during that call
 *  previously got silently overwritten back to "completed" once the model
 *  responded. Per-step cost/trace is already durable via insertRunStep
 *  regardless of whether this summary write lands, so no billing accuracy is
 *  lost by the `.eq("status", "running")` guard — only the status field. */
export async function finalizeRunCompleted(
  supabase: SupabaseClient,
  runId: string,
  finalText: string,
  totals: { inputTokensTotal: number; outputTokensTotal: number; steps: number; costCents: number }
): Promise<void> {
  const output = {
    id: runId,
    object: "response",
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: finalText }] }],
    usage: { input_tokens: totals.inputTokensTotal, output_tokens: totals.outputTokensTotal, tools: {} },
    steps: totals.steps,
    x_ahura_cost_cents: round4(totals.costCents),
  };
  const { error } = await supabase
    .schema("agentcore")
    .from("runs")
    .update({ status: "completed", output, step_count: totals.steps, cost_cents: round4(totals.costCents) })
    .eq("id", runId)
    .eq("status", "running");
  logIfWriteFailed("finalizeRunCompleted", runId, error);
}

/** Same cancellation guard as finalizeRunCompleted — a run cancelled
 *  mid-flight must not get silently flipped to "failed" once the in-flight
 *  call errors out. */
export async function finalizeRunFailed(
  supabase: SupabaseClient,
  runId: string,
  error: string,
  costCents: number | null,
  steps: number | null
): Promise<void> {
  const update: Record<string, unknown> = { status: "failed", error };
  if (costCents != null) update.cost_cents = round4(costCents);
  if (steps != null) update.step_count = steps;
  const { error: writeError } = await supabase.schema("agentcore").from("runs").update(update).eq("id", runId).eq("status", "running");
  logIfWriteFailed("finalizeRunFailed", runId, writeError);
}

/**
 * Found live (2026-07-18): neither finalize write checked its own result —
 * a genuine failure (not the expected "0 rows, already cancelled" no-op)
 * left the run stuck at status "running" forever, invisible until the
 * 15-minute reaper eventually caught it, with nothing in the logs
 * explaining why. Logs loudly rather than throwing: this already runs
 * inside lifecycle.ts's/agent-delegate.ts's own outermost catch/finally,
 * so throwing again here would only produce a harder-to-diagnose secondary
 * unhandled rejection instead of a clear, greppable log line.
 */
function logIfWriteFailed(fn: string, runId: string, error: { message: string } | null): void {
  if (!error) return;
  console.error(
    JSON.stringify({
      level: "error",
      service: "ahura-agent-runner",
      scope: fn,
      runId,
      err: error.message,
      msg: "finalize write failed — run may be stuck at its previous status until the reaper catches it",
    })
  );
}
