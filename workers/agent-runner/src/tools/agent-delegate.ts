/**
 * Agent-delegate tool ("A2A", scoped narrowly per doc 02 — nextstespsAI/
 * 18-agent-delegation.md has the full account). One agent calls another
 * agent IN THE SAME ORG as a tool. Deliberately NOT the Google/Linux
 * Foundation A2A wire protocol (no AgentCard, no JSON-RPC surface, no
 * cross-org) — doc 02 itself scoped v1 as "internal-only, one of our agents
 * calling another as a tool," and that's exactly what this is: the target
 * agent's own /v1/agents/:id/runs semantics, executed in-process instead of
 * round-tripping through the queue, because we're already inside the one
 * process that runs agent loops.
 *
 * Design choice, stated plainly: the sub-agent call is a REAL agentcore.runs
 * row (parent_run_id + depth, migration 20260717000001) — not a hidden
 * side-effect buried in a tool's `detail` blob. It gets its own trace, and
 * its own model/tool costs bill through the EXACT same pipeline any run
 * already uses (on-behalf-of gateway calls, reportToolUsage for its own
 * tool steps) — zero new billing code, avoiding the exact "forked billing
 * path" mistake found and fixed elsewhere this session (doc 16). This
 * tool's OWN step is metered {units:0, unitLabel:"agent_call"} — always
 * free at the parent-tool-call level by design, since the real cost already
 * bills via the sub-run itself. "agent_call" is deliberately never added to
 * tool-usage-report.ts's REPORTABLE_UNIT_LABELS, so it can never be
 * double-reported to the usage pipeline even by accident.
 *
 * Explicit v1 scope cuts (documented, not silent):
 *   - No sandbox/code-interpreter tool for the sub-agent (nested sandbox
 *     session lifecycle is real added complexity with no immediate need).
 *   - No agent-memory auto-recall for the sub-agent (keeps the delegated
 *     call a clean, self-contained task instead of injecting the target
 *     agent's own memory context on every hop).
 *   - No parent-conversation context: the model must pass a clear,
 *     self-contained `input` string — the sub-agent never sees the parent's
 *     prior turns.
 *   - The PARENT's own max_cost_cents ceiling does not sum in sub-run
 *     spend — each run (parent and every delegated sub-run) is bounded by
 *     its OWN max_cost_cents independently, not a combined budget. Bounded,
 *     just not unified; a real follow-up if this becomes a problem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runAgentLoop,
  toMessages,
  type AgentDelegateToolDecl,
  type AgentTool,
  type AgentToolDecl,
  type McpToolDecl,
  type LoopMessage,
  type RunCtx,
  type ToolResult,
} from "@ahura/agent-core";
import type { RunnerEnv } from "../env.js";
import { makeCallModel } from "../gateway.js";
import { buildDispatcher } from "./dispatch.js";
import { attachMcpTools } from "./mcp-attach.js";
import { reportToolUsage } from "../tool-usage-report.js";
import { preview } from "./detail.js";
import {
  fetchModelPricing, fetchToolRates, priceStep, insertRunStep, isRunCancelled,
  finalizeRunCompleted, finalizeRunFailed, round4,
} from "../run-shared.js";

/** Hard cap on delegation hops. A→B→C→D is already a lot of nested agentic
 *  work for one customer request; this exists to make an accidental (or
 *  malicious) A→B→A cycle a bounded cost, not an unbounded one. */
const MAX_AGENT_DEPTH = 3;

interface TargetAgentRow {
  id: string;
  org_id: string;
  name: string;
  model: string;
  system_prompt: string | null;
  tools: AgentToolDecl[];
  guardrail: string;
  max_steps: number;
  max_cost_cents: number;
  is_active: boolean;
}

const err = (message: string): ToolResult => ({
  output: { error: message },
  metering: { units: 0, unitLabel: "agent_call" },
});

/** Org-scoped target lookup + validity checks, kept as one unit since every
 *  caller needs both: a decl can never resolve to another org's agent even
 *  if target_agent_id were somehow forged (same boundary every other tool —
 *  MCP registry, function webhooks — already enforces), and a target that's
 *  missing/disabled/self must fail the same way a forged one would. */
async function fetchTargetAgent(
  supabase: SupabaseClient,
  orgId: string,
  targetAgentId: string,
  callerAgentId: string | undefined
): Promise<{ target: TargetAgentRow } | { errorMessage: string }> {
  const { data: target } = await supabase
    .schema("agentcore")
    .from("agents")
    .select("id, org_id, name, model, system_prompt, tools, guardrail, max_steps, max_cost_cents, is_active")
    .eq("org_id", orgId)
    .eq("id", targetAgentId)
    .maybeSingle<TargetAgentRow>();

  if (!target || !target.is_active) return { errorMessage: "The delegated agent was not found or is disabled." };
  if (target.id === callerAgentId) return { errorMessage: "An agent cannot delegate to itself." };
  return { target };
}

/**
 * Tree-wide cost ceiling (found necessary by a pre-launch scalability
 * review, 2026-07-17): each run's own max_cost_cents only ever bounded
 * ITSELF — a delegation tree's total spend was unbounded by anything the
 * customer configured. root_run_id makes "how much has this whole tree
 * spent so far" one indexed query: the root's own steps (its finalize
 * hasn't landed yet since we're still inside it, so its run_steps are the
 * only accurate live number) plus every already-finalized descendant's
 * runs.cost_cents (accurate because delegation is sequential/depth-first —
 * by the time we're about to start a new hop, every earlier sibling
 * subtree has already finalized).
 *
 * Returns an error string for the model when the tree is over budget, null
 * when there's room for another hop.
 */
async function checkTreeBudget(supabase: SupabaseClient, rootRunId: string): Promise<string | null> {
  const [{ data: rootRow }, { data: rootStepRows }, { data: descendantRuns }] = await Promise.all([
    supabase.schema("agentcore").from("runs").select("max_cost_cents").eq("id", rootRunId).maybeSingle<{ max_cost_cents: number }>(),
    supabase.schema("agentcore").from("run_steps").select("cost_cents").eq("run_id", rootRunId),
    supabase.schema("agentcore").from("runs").select("cost_cents").eq("root_run_id", rootRunId),
  ]);
  const rootMaxCostCents = rootRow?.max_cost_cents ?? 0;
  const treeSpentSoFar =
    (rootStepRows ?? []).reduce((sum: number, r: { cost_cents: number }) => sum + Number(r.cost_cents ?? 0), 0) +
    (descendantRuns ?? []).reduce((sum: number, r: { cost_cents: number }) => sum + Number(r.cost_cents ?? 0), 0);
  if (rootMaxCostCents > 0 && treeSpentSoFar >= rootMaxCostCents) {
    return `This delegation tree already spent its shared budget (${treeSpentSoFar.toFixed(2)}¢ of ${rootMaxCostCents}¢) — no further delegate calls allowed on this run.`;
  }
  return null;
}

export function agentDelegateTool(
  decl: AgentDelegateToolDecl,
  deps: { env: RunnerEnv; supabase: SupabaseClient }
): AgentTool {
  return {
    type: "agent",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      const depth = ctx.depth ?? 0;
      if (depth >= MAX_AGENT_DEPTH) {
        return err(`Delegation depth limit (${MAX_AGENT_DEPTH}) reached — this agent cannot delegate further.`);
      }

      const a = (args ?? {}) as { input?: unknown };
      const input = typeof a.input === "string" ? a.input : "";
      if (!input.trim()) return err("agent delegation requires a non-empty `input` string");

      const targetResult = await fetchTargetAgent(deps.supabase, ctx.orgId, decl.target_agent_id, ctx.agentId);
      if ("errorMessage" in targetResult) return err(targetResult.errorMessage);
      const { target } = targetResult;

      const rootRunId = ctx.rootRunId ?? ctx.runId;
      const ancestors = [...(ctx.ancestorRunIds ?? []), ctx.runId];
      const budgetError = await checkTreeBudget(deps.supabase, rootRunId);
      if (budgetError) return err(budgetError);

      const startedAt = Date.now();
      const { data: subRun, error: createErr } = await deps.supabase
        .schema("agentcore")
        .from("runs")
        .insert({
          org_id: ctx.orgId,
          agent_id: target.id,
          billing_user_id: ctx.billingUserId,
          status: "running",
          input: { input },
          max_cost_cents: target.max_cost_cents,
          parent_run_id: ctx.runId,
          root_run_id: rootRunId,
          depth: depth + 1,
        })
        .select("id")
        .single<{ id: string }>();

      if (createErr || !subRun) {
        return err("Could not start the delegated agent run.");
      }

      const [pricing, toolRates] = await Promise.all([
        fetchModelPricing(deps.supabase, target.model),
        fetchToolRates(deps.supabase),
      ]);

      const messages: LoopMessage[] = [];
      if (target.system_prompt?.trim()) messages.push({ role: "system", content: target.system_prompt });
      messages.push(...toMessages(input));

      // No sandbox pool for a delegated sub-agent (v1 scope cut, see file
      // header) — its own `code` tool, if declared, reports unavailable.
      const baseDispatcher = buildDispatcher(target.tools, deps.env, deps.supabase, undefined);
      const mcpDecls = target.tools.filter((t): t is McpToolDecl => t.type === "mcp");
      const dispatcher = await attachMcpTools(
        baseDispatcher,
        mcpDecls,
        { timeoutMs: deps.env.toolTimeoutMs, allowPrivate: deps.env.allowPrivateWebhooks },
        { supabase: deps.supabase, orgId: ctx.orgId, dek: deps.env.mcpTokenDek }
      );

      const subRunCtx: RunCtx = {
        runId: subRun.id,
        orgId: ctx.orgId,
        billingUserId: ctx.billingUserId,
        agentId: target.id,
        zdr: ctx.zdr,
        depth: depth + 1,
        rootRunId,
        ancestorRunIds: ancestors,
      };

      // Heartbeat starvation (found by the same scalability review): the
      // reaper (app/api/agents/internal/run-reaper) expires any run whose
      // heartbeat_at goes stale for 15+ minutes. Every ancestor's heartbeat
      // ONLY updates between ITS OWN top-level steps — while any of them is
      // blocked awaiting this nested call, nothing bumps it. Bump the new
      // sub-run AND every ancestor (root through immediate parent) on every
      // nested step, so a long delegation chain can't get its own ancestors
      // reaped out from under it while still legitimately working. Bounded
      // cost: at most MAX_AGENT_DEPTH+1 rows, since the chain can't be
      // longer than that.
      const heartbeatTargets = [subRun.id, ...ancestors];
      const bumpHeartbeats = () => {
        void (async () => {
          try {
            await deps.supabase
              .schema("agentcore")
              .from("runs")
              .update({ heartbeat_at: new Date().toISOString() })
              .in("id", heartbeatTargets);
          } catch {
            // Best-effort — a missed heartbeat bump risks a late reap, not a
            // correctness failure; never let this interrupt the actual run.
          }
        })();
      };

      let inputTokensTotal = 0;
      let outputTokensTotal = 0;

      // Cancellation propagation (found by the same scalability review): if
      // the customer cancels the TOP-LEVEL run while a delegation chain is
      // several hops deep, nothing was checking for that — the nested loop
      // would run to completion regardless, burning real compute/money on a
      // request the customer explicitly tried to stop. Checked against the
      // ROOT (not the immediate parent) since that's the run the customer's
      // own Cancel button actually targets; mirrors lifecycle.ts's
      // assertNotCancelled, checked before every nested model turn exactly
      // like the top-level loop already does for its own turns.
      const assertRootNotCancelled = async () => {
        if (await isRunCancelled(deps.supabase, rootRunId)) throw new Error("root run was cancelled");
      };

      try {
        const loopPromise = runAgentLoop({
          messages,
          agent: { model: target.model, tools: target.tools, maxSteps: target.max_steps, maxCostCents: target.max_cost_cents },
          callModel: async (msgs) => {
            await assertRootNotCancelled();
            const turn = await makeCallModel(deps.env, target.model, ctx.orgId, dispatcher.modelTools, target.guardrail)(msgs);
            for (const c of turn.toolCalls) c.type = dispatcher.resolveType(c.name);
            return turn;
          },
          dispatchTool: (call) => dispatcher.dispatch(call, subRunCtx),
          priceStep: (step) => priceStep(step, pricing, toolRates),
          onStep: async (step) => {
            if (step.stepType === "model") {
              inputTokensTotal += step.inputTokens ?? 0;
              outputTokensTotal += step.outputTokens ?? 0;
            }
            // Throws on failure (run-shared.ts) — propagates out of runAgentLoop
            // so a lost trace write fails the sub-run loudly instead of leaving
            // it "completed" with silently missing steps (the same class of bug
            // lifecycle.ts's persistStep guards against for top-level runs).
            await insertRunStep(deps.supabase, subRun.id, ctx.orgId, step);
            // Same bridge every top-level run uses (workers/agent-runner/src/
            // tool-usage-report.ts) — the sub-run's own tool steps bill
            // through the real pipeline exactly like any other run's do.
            if (step.stepType !== "model") {
              void reportToolUsage(deps.env, ctx.orgId, `${subRun.id}:${step.stepIndex}`, {
                unitLabel: step.metering?.unitLabel,
                units: step.metering?.units,
                status: step.status,
              });
            }
            bumpHeartbeats();
          },
        });

        // Wall-clock cap (see env.ts's agentDelegateTimeoutMs doc comment) —
        // bounds how long THIS CALL can hold the parent's one concurrency
        // slot hostage, independent of the model/tool-level timeouts a hung
        // step inside the nested loop might otherwise never trip. Known
        // limitation, stated plainly: Promise.race doesn't abort loopPromise
        // itself — a timed-out sub-loop can keep doing background work
        // briefly after this call returns, until its OWN model/tool-level
        // timeouts eventually end it. The primary goal (bounding what the
        // PARENT waits on) is met either way; true mid-loop cancellation
        // would need an AbortSignal threaded through runAgentLoop's
        // callModel/dispatchTool, a bigger change than this pass makes.
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`delegated agent call exceeded ${deps.env.agentDelegateTimeoutMs}ms`)),
            deps.env.agentDelegateTimeoutMs
          );
        });
        const result = await Promise.race([loopPromise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));

        await dispatcher.dispose();

        if (result.stopReason === "final_answer") {
          await finalizeRunCompleted(deps.supabase, subRun.id, result.finalText, {
            inputTokensTotal,
            outputTokensTotal,
            steps: result.stepsUsed,
            costCents: result.costCents,
          });

          return {
            output: { result: result.finalText },
            metering: { units: 0, unitLabel: "agent_call" },
            detail: {
              target_agent: preview(target.name, 100),
              target_agent_id: target.id,
              sub_run_id: subRun.id,
              steps: result.stepsUsed,
              cost_cents: round4(result.costCents),
              latency_ms: Date.now() - startedAt,
            },
          };
        }

        await finalizeRunFailed(deps.supabase, subRun.id, result.stopReason, result.costCents, result.stepsUsed);
        return err(`The delegated agent stopped early (${result.stopReason}).`);
      } catch (e) {
        await dispatcher.dispose().catch(() => undefined);
        const msg = e instanceof Error ? e.message : String(e);
        await finalizeRunFailed(deps.supabase, subRun.id, msg, null, null);
        return err(`The delegated agent run failed: ${msg}`);
      }
    },
  };
}
