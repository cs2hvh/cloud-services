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
  type RunCtx,
} from "@ahura/agent-core";
import type { RunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import type { AgentJob } from "./scan.js";
import { makeCallModel } from "./gateway.js";
import { buildDispatcher } from "./tools/dispatch.js";
import { sandboxPoolFor } from "./tools/spec.js";
import { searchMemories, hasAnyMemories } from "./tools/memory.js";
import { preview } from "./tools/detail.js";

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
  guardrail: string | null;
}

interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
}

/** cents-per-unit for each hosted-tool unit_label (from the agent/* catalog rows). */
export type ToolRates = Record<string, number>;

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

    // ── 3. Model + tool pricing for the per-step ceiling guard ─────────────────
    const pricing = await fetchModelPricing(ctx, cfg.model);
    const toolRates = await fetchToolRates(ctx);

    const messages = await buildMessages(ctx, run, cfg);
    const zdr = await fetchOrgZdr(ctx, run.org_id); // ZDR orgs must not persist OR auto-recall memory

    // ── 3b. Automatic memory recall (BEFORE the model runs) ────────────────────
    // Recall must not depend on the model choosing to call the memory tool —
    // small models routinely skip an implicit "check memory first" step (found
    // live: gpt-4o-mini answered "I don't know your name" with a matching stored
    // memory sitting right there). So if this agent has memory attached, embed
    // the user's current input and inject the top hits into the transcript up
    // front — this is the same pattern OpenAI's ChatGPT memory and MemGPT/Letta's
    // "core memory" use (proactive injection, not a model-invoked tool call).
    //
    // MIN_AUTO_RECALL_SIMILARITY gates what gets injected: unlike the explicit
    // `search` action (where the model sees raw results and can judge relevance
    // itself), this path is blind/automatic, so an unrelated query must NOT drag
    // in a stray "closest" memory just because top-K always returns something.
    // Threshold picked from live cosine-similarity data on text-embedding-3-small:
    // a genuine match scored ~0.38; unrelated pairs cluster much lower — 0.15 is a
    // conservative cut that admits real matches while filtering obvious noise.
    // Persisted as a real, billed trace step (index 0) only when something clears
    // the bar, so it's visible and priced through the same pipeline as a manual search.
    const MIN_AUTO_RECALL_SIMILARITY = 0.15;
    let autoRecallCostCents = 0;
    let loopStartIndex = 0;
    if (run.agent_id && !zdr && cfg.tools.some((t) => t.type === "memory")) {
      const queryText = extractLatestUserText(run.input as { input?: ResponsesInput });
      if (queryText && (await hasAnyMemories(ctx.supabase, run.agent_id))) {
        try {
          const { results: candidates, tokens } = await searchMemories(ctx.env, ctx.supabase, run.agent_id, queryText, 3);
          const results = candidates.filter((r) => r.similarity >= MIN_AUTO_RECALL_SIMILARITY);
          if (results.length > 0) {
            const recalled = results.map((r, i) => `${i + 1}. ${r.content}`).join("\n");
            messages.push({
              role: "system",
              content: `Relevant memories about this user, recalled from earlier conversations:\n${recalled}`,
            });
            const autoStep: LoopStep = {
              stepIndex: 0,
              stepType: "memory",
              toolName: "memory",
              metering: { units: 1, unitLabel: "memory_search" },
              status: "success",
              detail: {
                action: "auto_recall",
                query: preview(queryText, 200),
                snippets: results.map((r) => preview(r.content, 200)),
                count: results.length,
                candidates: candidates.length, // how many were fetched before the relevance filter
                embed_tokens: tokens,
              },
            };
            autoStep.costCents = priceStep(autoStep, pricing, toolRates);
            await persistStep(ctx, run, autoStep);
            autoRecallCostCents = autoStep.costCents;
            loopStartIndex = 1;
          }
        } catch (e) {
          // Best-effort: a recall failure must not fail the whole run — the
          // agent just proceeds without injected context, same as before this
          // feature existed.
          log.warn({ err: e instanceof Error ? e.message : String(e) }, "auto-recall failed, continuing without it");
        }
      }
    }

    // Build the tool dispatcher from the agent's declared tools (S2). It yields
    // the schemas advertised to the model + the name→adapter router. The sandbox
    // pool (if enabled) is ONE per run so code steps share state; it's disposed in
    // the finally below.
    const sandboxPool = ctx.env.sandboxEnabled ? sandboxPoolFor(ctx.env) : undefined;
    const dispatcher = buildDispatcher(cfg.tools, ctx.env, ctx.supabase, sandboxPool);
    try {
    const runCtx: RunCtx = {
      runId: run.id,
      orgId: run.org_id,
      billingUserId: run.billing_user_id,
      agentId: run.agent_id ?? undefined, // scopes agent memory (S5); absent for inline runs
      zdr, // ZDR orgs must not persist memory
    };

    // ── 4. Run the pure loop ───────────────────────────────────────────────────
    const result = await runAgentLoop({
      messages,
      agent: {
        model: cfg.model,
        tools: cfg.tools,
        maxSteps: cfg.maxSteps,
        maxCostCents: run.max_cost_cents,
      },
      costCentsSoFar: autoRecallCostCents,
      startStepIndex: loopStartIndex,
      // Cancellation gate → model turn (with tool schemas) → remap each tool_call
      // to its real step_type (web_search/function/…) so the trace is accurate.
      callModel: async (msgs) => {
        await assertNotCancelled(ctx, run.id);
        const turn = await makeCallModel(ctx.env, cfg.model, dispatcher.modelTools, cfg.guardrail)(msgs);
        for (const c of turn.toolCalls) c.type = dispatcher.resolveType(c.name);
        return turn;
      },
      // Route each tool call to its adapter (web_search / inline function; more in S2.1/S3/S4).
      dispatchTool: (call) => dispatcher.dispatch(call, runCtx),
      priceStep: (step) => priceStep(step, pricing, toolRates),
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
    } finally {
      // Tear down the sandbox session (if any) at run end — the only place it's
      // stopped, so state persists across all code steps within the run.
      await dispatcher.dispose();
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
      .select("model, system_prompt, tools, max_steps, guardrail")
      .eq("id", run.agent_id)
      .maybeSingle<{
        model: string;
        system_prompt: string | null;
        tools: AgentToolDecl[];
        max_steps: number;
        guardrail: string | null;
      }>();
    if (error || !agent) {
      throw new Error(`Agent ${run.agent_id} not found: ${error?.message ?? "no row"}`);
    }
    return {
      model: agent.model,
      systemPrompt: agent.system_prompt,
      tools: agent.tools ?? [],
      maxSteps: agent.max_steps ?? DEFAULT_MAX_STEPS,
      guardrail: agent.guardrail ?? null,
    };
  }

  // Inline request config.
  const input = run.input as {
    model?: string;
    system_prompt?: string;
    tools?: AgentToolDecl[];
    max_steps?: number;
    guardrail?: string;
  };
  if (!input.model) {
    throw new Error("Run has neither agent_id nor an inline model");
  }
  return {
    model: input.model,
    systemPrompt: input.system_prompt ?? null,
    tools: input.tools ?? [],
    maxSteps: input.max_steps ?? DEFAULT_MAX_STEPS,
    guardrail: input.guardrail ?? null,
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
  const visited = new Set<string>(); // cycle guard: a forged/looping chain can't spin
  let cursor: string | null = previousResponseId;
  let hops = 0;
  while (cursor && hops < MAX_CHAIN_TURNS) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
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

/** Pull a plain-text query out of the run's raw input for the auto-recall embed.
 *  A bare string is used as-is; an OpenAI-style message array uses the LAST
 *  `user` message (mirrors what the model itself is actually responding to). */
function extractLatestUserText(input: { input?: ResponsesInput } | null | undefined): string {
  const raw = input?.input;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const item = raw[i] as { role?: unknown; content?: unknown };
      if (item?.role === "user") {
        return typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? "");
      }
    }
  }
  return "";
}

/** Org zero-data-retention flag — gates tools that would PERSIST customer data
 *  (agent memory writes). Defaults to false (retention allowed) if unreadable. */
async function fetchOrgZdr(ctx: RunContext, orgId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .schema("inference")
    .from("orgs")
    .select("zdr_default")
    .eq("id", orgId)
    .maybeSingle<{ zdr_default: boolean }>();
  return data?.zdr_default ?? false;
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

/** Maps a hosted-tool pricing row's `cents_per_*` key to its metering unit_label. */
const TOOL_PRICE_KEY_TO_LABEL: Record<string, string> = {
  cents_per_web_search: "web_search",
  cents_per_function_call: "function_call",
  cents_per_cpu_second: "cpu_second",
  cents_per_file_search: "file_search",
  cents_per_memory_write: "memory_write",
  cents_per_memory_search: "memory_search",
};

/**
 * Load per-unit tool rates from the internal `agent/*` catalog rows so tool steps
 * count toward the mid-run cost ceiling (§9). Placeholder rates PENDING_FINANCE —
 * but the guard must sum tool spend regardless, else an agent that only calls
 * expensive tools (never re-invoking the model) could run past its budget.
 */
async function fetchToolRates(ctx: RunContext): Promise<ToolRates> {
  const { data } = await ctx.supabase
    .schema("inference")
    .from("models")
    .select("pricing")
    .like("model_id", "agent/%");
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
 *  authoritative billed amount comes from the usage pipeline later.
 *  Exported for unit testing the tool-cost path. */
export function priceStep(step: LoopStep, pricing: ModelPricing, toolRates: ToolRates): number {
  if (step.stepType === "model") {
    const inRate = pricing.input_cents_per_mtok ?? 0;
    const outRate = pricing.output_cents_per_mtok ?? 0;
    return (
      ((step.inputTokens ?? 0) * inRate) / 1_000_000 +
      ((step.outputTokens ?? 0) * outRate) / 1_000_000
    );
  }
  // Tool step: price by its metering (units × per-unit-label rate).
  const label = step.metering?.unitLabel;
  const units = step.metering?.units ?? 0;
  const rate = label ? toolRates[label] ?? 0 : 0;
  return units * rate;
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
    // Tool steps carry a small brand-scrubbed detail preview (set by the adapter,
    // already upstream-scrubbed, §11); model steps have none (output → runs.output).
    detail: step.detail ?? null,
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
