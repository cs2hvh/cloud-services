/**
 * Agent run lifecycle (T1.3d/e).
 *
 * Flow:
 *   1. Atomic claim: queued → running (only one replica wins — mirrors eval-runner)
 *   2. Resolve config: stored agent (agentcore.agents) OR inline request fields
 *   3. Fetch model pricing (for per-step cost → mid-run ceiling guard + trace)
 *   4. runAgentLoop (pure core): model turns via the gateway; dispatchTool THROWS
 *      in S1 (model-only — hosted tools land in S2). Each step persists a
 *      run_steps row + bumps heartbeat.
 *   5. Finalize: completed (final answer) / failed (guard trip or error) /
 *      cancelled (respected if the control plane flipped status mid-run).
 *
 * BILLING (S1): model turns authenticate with the platform key. On-behalf-of
 * customer billing is wired with the gateway in S1.2 + Phase-0 billing hardening.
 * Until then we record cost on run_steps/runs for the trace + mid-run guard only
 * — nothing is charged (matches "nothing agent-related charges money until
 * billing hardening", §9).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runAgentLoop,
  toMessages,
  type AgentToolDecl,
  type LoopMessage,
  type LoopStep,
  type ResponsesInput,
} from "@ahura/agent-core";
import type { RunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import type { AgentJob } from "./scan.js";
import { makeCallModel } from "./gateway.js";

export interface RunContext {
  env: RunnerEnv;
  supabase: SupabaseClient;
  logger: Logger;
  podId: string;
}

/** Raised to abort the loop when the control plane cancels a run mid-flight. */
class RunCancelledError extends Error {
  constructor() {
    super("run cancelled");
    this.name = "RunCancelledError";
  }
}

interface ClaimedRun {
  id: string;
  org_id: string;
  agent_id: string | null;
  billing_user_id: string;
  input: Record<string, unknown>;
  max_cost_cents: number;
  previous_response_id: string | null;
}

/** Max prior runs to replay when following a previous_response_id chain. */
const MAX_CHAIN_TURNS = 20;

interface RuntimeConfig {
  model: string;
  systemPrompt: string | null;
  tools: AgentToolDecl[];
  maxSteps: number;
}

interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
}

const DEFAULT_MAX_STEPS = 12;

export async function runAgentJob(ctx: RunContext, job: AgentJob): Promise<void> {
  const { supabase, logger, podId } = ctx;
  const log = logger.child({ runId: job.runId });

  // ── 1. Atomic claim (only a queued run matches → no double-claim) ────────────
  const { data: run } = await supabase
    .schema("agentcore")
    .from("runs")
    .update({ status: "running", claimed_by: podId, heartbeat_at: new Date().toISOString() })
    .eq("id", job.runId)
    .eq("status", "queued")
    .select("id, org_id, agent_id, billing_user_id, input, max_cost_cents, previous_response_id")
    .maybeSingle<ClaimedRun>();

  if (!run) {
    log.info("run already claimed/cancelled — skipping");
    return;
  }
  log.info("claimed agent run");

  // token totals for the final usage envelope
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;

  try {
    // ── 2. Resolve config (stored agent or inline request) ─────────────────────
    const cfg = await resolveConfig(ctx, run);

    // ── 3. Model pricing for the per-step ceiling guard ────────────────────────
    const pricing = await fetchModelPricing(ctx, cfg.model);

    const messages = await buildMessages(ctx, run, cfg);

    // ── 4. Run the pure loop ───────────────────────────────────────────────────
    const result = await runAgentLoop({
      messages,
      agent: {
        model: cfg.model,
        tools: cfg.tools,
        maxSteps: cfg.maxSteps,
        maxCostCents: run.max_cost_cents,
      },
      // Cancellation gate before each model turn, then the real gateway call.
      callModel: async (msgs) => {
        await assertNotCancelled(ctx, run.id);
        return makeCallModel(ctx.env, cfg.model)(msgs);
      },
      // S1 is model-only — no hosted tools yet (they arrive in S2).
      dispatchTool: async () => {
        throw new Error("This agent has no enabled tools (S1 is model-only).");
      },
      priceStep: (step) => priceModelStep(step, pricing),
      onStep: async (step) => {
        if (step.stepType === "model") {
          inputTokensTotal += step.inputTokens ?? 0;
          outputTokensTotal += step.outputTokens ?? 0;
        }
        await persistStep(ctx, run, step);
      },
    });

    // ── 5. Finalize ────────────────────────────────────────────────────────────
    if (result.stopReason === "final_answer") {
      await finalizeCompleted(ctx, run, result.finalText, {
        inputTokensTotal,
        outputTokensTotal,
        steps: result.stepsUsed,
        costCents: result.costCents,
      });
      log.info({ steps: result.stepsUsed, costCents: result.costCents }, "agent run completed");
    } else {
      // max_steps_exceeded | max_cost_exceeded
      await finalizeFailed(ctx, run.id, result.stopReason, result.costCents, result.stepsUsed);
      log.warn({ reason: result.stopReason }, "agent run stopped by guard");
    }
  } catch (err) {
    if (err instanceof RunCancelledError) {
      log.info("run cancelled mid-flight — leaving cancelled status");
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "agent run failed");
    await finalizeFailed(ctx, run.id, msg, null, null);
  }
}

// ── config resolution ───────────────────────────────────────────────────────

async function resolveConfig(ctx: RunContext, run: ClaimedRun): Promise<RuntimeConfig> {
  if (run.agent_id) {
    const { data: agent, error } = await ctx.supabase
      .schema("agentcore")
      .from("agents")
      .select("model, system_prompt, tools, max_steps")
      .eq("id", run.agent_id)
      .maybeSingle<{
        model: string;
        system_prompt: string | null;
        tools: AgentToolDecl[];
        max_steps: number;
      }>();
    if (error || !agent) {
      throw new Error(`Agent ${run.agent_id} not found: ${error?.message ?? "no row"}`);
    }
    return {
      model: agent.model,
      systemPrompt: agent.system_prompt,
      tools: agent.tools ?? [],
      maxSteps: agent.max_steps ?? DEFAULT_MAX_STEPS,
    };
  }

  // Inline request config.
  const input = run.input as {
    model?: string;
    system_prompt?: string;
    tools?: AgentToolDecl[];
    max_steps?: number;
  };
  if (!input.model) {
    throw new Error("Run has neither agent_id nor an inline model");
  }
  return {
    model: input.model,
    systemPrompt: input.system_prompt ?? null,
    tools: input.tools ?? [],
    maxSteps: input.max_steps ?? DEFAULT_MAX_STEPS,
  };
}

/**
 * Build the loop's opening transcript: system prompt → replayed prior turns
 * (if this run chains off a previous_response_id) → the current input.
 *
 * Chaining walks the previous_response_id links (oldest→newest, capped), pulling
 * each prior run's user input + final assistant text. The walk is org-scoped so a
 * forged previous_response_id can't pull another org's conversation.
 */
async function buildMessages(
  ctx: RunContext,
  run: ClaimedRun,
  cfg: RuntimeConfig
): Promise<LoopMessage[]> {
  const messages: LoopMessage[] = [];
  if (cfg.systemPrompt && cfg.systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: cfg.systemPrompt });
  }
  messages.push(...(await loadPriorTurns(ctx, run.org_id, run.previous_response_id)));
  const request = run.input as { input?: ResponsesInput };
  messages.push(...toMessages(request.input ?? ""));
  return messages;
}

async function loadPriorTurns(
  ctx: RunContext,
  orgId: string,
  previousResponseId: string | null
): Promise<LoopMessage[]> {
  if (!previousResponseId) return [];

  // Walk the chain newest→oldest, then reverse to replay oldest→newest.
  const chain: Array<{ input: unknown; output: unknown }> = [];
  let cursor: string | null = previousResponseId;
  let hops = 0;
  while (cursor && hops < MAX_CHAIN_TURNS) {
    const { data } = await ctx.supabase
      .schema("agentcore")
      .from("runs")
      .select("input, output, previous_response_id")
      .eq("id", cursor)
      .eq("org_id", orgId)
      .maybeSingle();
    const row = data as PriorRunRow | null;
    if (!row) break;
    chain.push({ input: row.input, output: row.output });
    cursor = row.previous_response_id;
    hops++;
  }
  chain.reverse();

  const turns: LoopMessage[] = [];
  for (const link of chain) {
    const priorInput = (link.input as { input?: ResponsesInput })?.input ?? "";
    turns.push(...toMessages(priorInput));
    const assistantText = extractFinalText(link.output);
    if (assistantText) turns.push({ role: "assistant", content: assistantText });
  }
  return turns;
}

interface PriorRunRow {
  input: { input?: ResponsesInput };
  output: unknown;
  previous_response_id: string | null;
}

/** Pull the final assistant text out of a stored ResponsesOutput envelope. */
function extractFinalText(output: unknown): string | null {
  const o = output as
    | { output?: Array<{ content?: Array<{ text?: string }> }> }
    | null
    | undefined;
  const text = o?.output?.[0]?.content?.[0]?.text;
  return typeof text === "string" && text.length > 0 ? text : null;
}

async function fetchModelPricing(ctx: RunContext, model: string): Promise<ModelPricing> {
  const { data } = await ctx.supabase
    .schema("inference")
    .from("models")
    .select("pricing")
    .eq("model_id", model)
    .maybeSingle<{ pricing: ModelPricing }>();
  return data?.pricing ?? {};
}

/** Fractional cents for a model step (kept precise for the ceiling comparison;
 *  the authoritative billed amount comes from the usage pipeline later). */
function priceModelStep(step: LoopStep, pricing: ModelPricing): number {
  if (step.stepType !== "model") return 0;
  const inRate = pricing.input_cents_per_mtok ?? 0;
  const outRate = pricing.output_cents_per_mtok ?? 0;
  return (
    ((step.inputTokens ?? 0) * inRate) / 1_000_000 +
    ((step.outputTokens ?? 0) * outRate) / 1_000_000
  );
}

// ── persistence ───────────────────────────────────────────────────────────────

async function persistStep(ctx: RunContext, run: ClaimedRun, step: LoopStep): Promise<void> {
  const { error: stepErr } = await ctx.supabase.schema("agentcore").from("run_steps").insert({
    run_id: run.id,
    org_id: run.org_id,
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
    // detail intentionally null in S1 — model output lives in runs.output.
    // When tool outputs land (S2), detail MUST be brand-scrubbed first (§11).
    detail: null,
  });
  // A failed step insert must NOT be silent — it means a lost trace + lost
  // per-step usage while the run still looks "completed". Throw so the run
  // fails loudly (caught → finalizeFailed). This defect was found by live E2E:
  // a missing sequence grant made every run_steps insert fail unnoticed.
  if (stepErr) throw new Error(`persist run_step ${step.stepIndex} failed: ${stepErr.message}`);

  // Heartbeat + progress so the reaper doesn't treat a live run as stale.
  await ctx.supabase
    .schema("agentcore")
    .from("runs")
    .update({ heartbeat_at: new Date().toISOString(), step_count: step.stepIndex + 1 })
    .eq("id", run.id);
}

async function finalizeCompleted(
  ctx: RunContext,
  run: ClaimedRun,
  finalText: string,
  totals: { inputTokensTotal: number; outputTokensTotal: number; steps: number; costCents: number }
): Promise<void> {
  const output = {
    id: run.id,
    object: "response",
    status: "completed",
    output: [
      { type: "message", content: [{ type: "output_text", text: finalText }] },
    ],
    usage: {
      input_tokens: totals.inputTokensTotal,
      output_tokens: totals.outputTokensTotal,
      tools: {},
    },
    steps: totals.steps,
    x_ahura_cost_cents: round4(totals.costCents),
  };

  await ctx.supabase
    .schema("agentcore")
    .from("runs")
    .update({
      status: "completed",
      output,
      step_count: totals.steps,
      cost_cents: round4(totals.costCents),
    })
    .eq("id", run.id);
}

async function finalizeFailed(
  ctx: RunContext,
  runId: string,
  error: string,
  costCents: number | null,
  steps: number | null
): Promise<void> {
  const update: Record<string, unknown> = { status: "failed", error };
  if (costCents != null) update.cost_cents = round4(costCents);
  if (steps != null) update.step_count = steps;
  await ctx.supabase.schema("agentcore").from("runs").update(update).eq("id", runId);
}

async function assertNotCancelled(ctx: RunContext, runId: string): Promise<void> {
  const { data } = await ctx.supabase
    .schema("agentcore")
    .from("runs")
    .select("status")
    .eq("id", runId)
    .maybeSingle<{ status: string }>();
  if (data?.status === "cancelled") throw new RunCancelledError();
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
