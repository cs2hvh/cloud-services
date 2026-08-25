/**
 * Agents v2 (`agentcore`) — the pure agent loop (S1.1, T1.1a–c).
 *
 * Doc: nextstespsAI/11-agent-implementation-plan.md (§6) · 12-agent-execution-stages.md (S1.1)
 *
 * The testable heart of the runtime: a pure function with ZERO network and ZERO
 * DB access. Everything is injected — `callModel` (one model turn), `dispatchTool`
 * (one tool call), `priceStep` (per-step cents, keeps pricing out of the loop),
 * and `onStep` (persistence side-effect). The gateway never runs this in v1
 * (durable-only, §6); the Node `agent-runner` and unit tests are the only two
 * injection sites — which is what closes the inline-vs-durable drift risk.
 *
 * Step accounting:
 *   - `maxSteps` caps the number of MODEL TURNS (one outer iteration = one model
 *     turn + its zero-or-more tool calls), matching the schema's max_steps.
 *   - `stepIndex` is a monotonic counter over EVERY persisted step (model + each
 *     tool call), matching agentcore.run_steps.step_index (UNIQUE per run).
 */

import type { AgentToolDecl } from "./types.js";
import type { ToolMetering, ToolResult } from "./tools/types.js";
// Value import; messages.ts imports only TYPES from this file, so there is no
// runtime import cycle (type imports are erased).
import { toToolMessage } from "./messages.js";

/** A single chat message in the loop's working transcript. */
export interface LoopMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/** The tool `type` a call maps to (never "model"). */
export type StepTypeToolName = "web_search" | "file_search" | "code" | "function" | "memory" | "mcp" | "agent";

/** A model-requested tool call (OpenAI-shaped). */
export interface ToolCall {
  id: string;
  type: StepTypeToolName;
  name: string;
  /** Raw JSON string of arguments as emitted by the model. */
  arguments: string;
}

/** One model turn's result, normalized from the chat-completions response. */
export interface ModelTurn {
  content: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Injected: perform one model turn. In the runner this is an HTTP call to /v1. */
export type CallModel = (messages: LoopMessage[]) => Promise<ModelTurn>;

/** Injected: execute one tool call. In tests a fake; in the runner it fans out to adapters. */
export type DispatchTool = (call: ToolCall) => Promise<ToolResult>;

/**
 * Injected: price one step in cents. Keeps catalog pricing OUT of the pure loop
 * while still letting the loop enforce the mid-run cost ceiling. Returns 0 when
 * not supplied (only the max_steps guard is active in that case).
 */
export type PriceStep = (step: LoopStep) => number;

/** Injected: called after every step so the runner can persist run_steps + emit usage. */
export type OnStep = (step: LoopStep) => void | Promise<void>;

export interface LoopStep {
  stepIndex: number;
  stepType: "model" | StepTypeToolName;
  toolName?: string;
  inputTokens?: number;
  outputTokens?: number;
  metering?: ToolMetering;
  /** Cents attributed to this step (set by the loop via `priceStep`). */
  costCents?: number;
  latencyMs?: number;
  status: "success" | "error";
  detail?: Record<string, unknown>;
}

export interface RunAgentLoopParams {
  messages: LoopMessage[];
  agent: {
    model: string;
    tools: AgentToolDecl[];
    maxSteps: number;
    maxCostCents: number;
  };
  callModel: CallModel;
  dispatchTool: DispatchTool;
  priceStep?: PriceStep;
  onStep?: OnStep;
  /** Seed the running cost total (e.g. resuming a run, or a pre-loop step like
   *  memory auto-recall). Defaults to 0. */
  costCentsSoFar?: number;
  /** Seed the step index (e.g. a pre-loop auto-recall step already persisted at
   *  index 0). Defaults to 0. Keeps run_steps.step_index contiguous/unique. */
  startStepIndex?: number;
  /** Injected clock for latency measurement; defaults to Date.now. Enables deterministic tests. */
  now?: () => number;
}

export type LoopStopReason =
  | "final_answer"
  | "max_steps_exceeded"
  | "max_cost_exceeded";

export interface RunAgentLoopResult {
  finalText: string;
  stopReason: LoopStopReason;
  /** Total persisted steps (model turns + tool calls). */
  stepsUsed: number;
  /** Number of model turns executed (comparable to agent.max_steps). */
  modelTurns: number;
  costCents: number;
}

/**
 * Run the multi-step tool loop until the model returns a final answer with no
 * tool calls, or a guard (`maxSteps` / `maxCostCents`) trips.
 *
 * The input `messages` array is never mutated — the loop works on a copy.
 */
export async function runAgentLoop(params: RunAgentLoopParams): Promise<RunAgentLoopResult> {
  const {
    agent,
    callModel,
    dispatchTool,
    priceStep,
    onStep,
    costCentsSoFar = 0,
    startStepIndex = 0,
    now = Date.now,
  } = params;

  const messages: LoopMessage[] = [...params.messages];
  let costCents = costCentsSoFar;
  let stepIndex = startStepIndex;
  let modelTurns = 0;
  let finalText = "";

  const priceOf = (step: LoopStep): number => {
    const cents = priceStep ? priceStep(step) : 0;
    return Number.isFinite(cents) && cents > 0 ? cents : 0;
  };

  const stop = (stopReason: LoopStopReason): RunAgentLoopResult => ({
    finalText,
    stopReason,
    stepsUsed: stepIndex,
    modelTurns,
    costCents,
  });

  for (let turn = 0; turn < agent.maxSteps; turn++) {
    // Cost gate BEFORE spending on the next model turn — a runaway loop is cut
    // off rather than overdrawing (§9 third gate).
    if (costCents >= agent.maxCostCents) return stop("max_cost_exceeded");

    // ── Model turn ──────────────────────────────────────────────────────────
    const mStart = now();
    const modelTurn = await callModel(messages);
    modelTurns++;

    const modelStep: LoopStep = {
      stepIndex,
      stepType: "model",
      inputTokens: modelTurn.usage.inputTokens,
      outputTokens: modelTurn.usage.outputTokens,
      latencyMs: now() - mStart,
      status: "success",
    };
    modelStep.costCents = priceOf(modelStep);
    costCents += modelStep.costCents;
    await onStep?.(modelStep);
    stepIndex++;

    // Record the assistant message (with any tool calls) into the transcript.
    messages.push({
      role: "assistant",
      content: modelTurn.content,
      ...(modelTurn.toolCalls.length > 0 ? { tool_calls: modelTurn.toolCalls } : {}),
    });

    // No tool calls → this is the final answer.
    if (modelTurn.toolCalls.length === 0) {
      finalText = modelTurn.content;
      return stop("final_answer");
    }

    // ── Tool fan-out ────────────────────────────────────────────────────────
    for (const call of modelTurn.toolCalls) {
      // Re-check the ceiling between tool calls too (tools can be the expensive part).
      if (costCents >= agent.maxCostCents) return stop("max_cost_exceeded");

      const tStart = now();
      let toolStep: LoopStep;
      let toolMessageOutput: unknown;

      try {
        const result = await dispatchTool(call);
        toolStep = {
          stepIndex,
          stepType: call.type,
          toolName: call.name,
          metering: result.metering,
          latencyMs: now() - tStart,
          status: "success",
          detail: result.detail,
        };
        toolMessageOutput = result.output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolStep = {
          stepIndex,
          stepType: call.type,
          toolName: call.name,
          latencyMs: now() - tStart,
          status: "error",
          detail: { error: message },
        };
        // Feed the error back so the model can react (repair / try another tool)
        // rather than silently hanging — the loop continues.
        toolMessageOutput = { error: message };
      }

      toolStep.costCents = priceOf(toolStep);
      costCents += toolStep.costCents;
      await onStep?.(toolStep);
      stepIndex++;

      messages.push(toToolMessage(call, toolMessageOutput));
    }
  }

  // Exhausted the model-turn budget without a final answer.
  return stop("max_steps_exceeded");
}
