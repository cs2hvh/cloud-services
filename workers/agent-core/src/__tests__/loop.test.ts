import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../loop.js";
import type {
  CallModel,
  DispatchTool,
  LoopMessage,
  LoopStep,
  ModelTurn,
  ToolCall,
} from "../loop.js";
import type { ToolResult } from "../tools/types.js";

// Doc: nextstespsAI/12-agent-execution-stages.md (S1.1, T1.1a–c)
// The pure loop is proven end-to-end with fakes — ZERO network, ZERO DB.

// ── fakes / helpers ───────────────────────────────────────────────────────────

function modelTurn(content: string, toolCalls: ToolCall[] = []): ModelTurn {
  return { content, toolCalls, usage: { inputTokens: 10, outputTokens: 5 } };
}

const toolCall = (id: string, type: ToolCall["type"] = "web_search"): ToolCall => ({
  id,
  type,
  name: type,
  arguments: "{}",
});

/** Scripted model: returns each turn in order, clamping to the last (so a
 *  single-element script repeats forever — handy for runaway tests). Records a
 *  snapshot of the transcript it was called with. */
function scriptedModel(turns: ModelTurn[]): { fn: CallModel; calls: LoopMessage[][] } {
  const calls: LoopMessage[][] = [];
  let i = 0;
  const fn: CallModel = async (messages) => {
    calls.push(messages.map((m) => ({ ...m })));
    const turn = turns[Math.min(i, turns.length - 1)];
    i++;
    return turn;
  };
  return { fn, calls };
}

const okDispatch =
  (output: unknown = "tool-result"): DispatchTool =>
  async () => ({ output, metering: { units: 1, unitLabel: "web_search" } }) as ToolResult;

const agent = (over: Partial<Parameters<typeof runAgentLoop>[0]["agent"]> = {}) => ({
  model: "test/model",
  tools: [],
  maxSteps: 12,
  maxCostCents: 1000,
  ...over,
});

// ── T1.1a — skeleton ──────────────────────────────────────────────────────────

describe("runAgentLoop — skeleton", () => {
  it("returns the final answer when the model emits no tool calls", async () => {
    const { fn } = scriptedModel([modelTurn("the answer")]);
    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool: okDispatch(),
    });
    expect(res.stopReason).toBe("final_answer");
    expect(res.finalText).toBe("the answer");
    expect(res.modelTurns).toBe(1);
    expect(res.stepsUsed).toBe(1);
  });

  it("does not mutate the caller's messages array", async () => {
    const messages: LoopMessage[] = [{ role: "user", content: "q" }];
    const { fn } = scriptedModel([modelTurn("done")]);
    await runAgentLoop({ messages, agent: agent(), callModel: fn, dispatchTool: okDispatch() });
    expect(messages).toEqual([{ role: "user", content: "q" }]);
  });
});

// ── T1.1b — tool-call fan-out ──────────────────────────────────────────────────

describe("runAgentLoop — tool fan-out", () => {
  it("dispatches a tool call, feeds the result back, and continues", async () => {
    const { fn, calls } = scriptedModel([
      modelTurn("", [toolCall("c1")]),
      modelTurn("final"),
    ]);
    let dispatched: ToolCall | null = null;
    const dispatchTool: DispatchTool = async (call) => {
      dispatched = call;
      return { output: "search-hit", metering: { units: 1, unitLabel: "web_search" } };
    };

    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool,
    });

    expect(dispatched!.id).toBe("c1");
    expect(res.finalText).toBe("final");
    expect(res.modelTurns).toBe(2);
    expect(res.stepsUsed).toBe(3); // model, tool, model

    // The 2nd model call must see the tool result appended to the transcript.
    const secondCallTranscript = calls[1];
    const toolMsg = secondCallTranscript.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ role: "tool", tool_call_id: "c1", content: "search-hit" });
  });

  it("fans out to every tool call in one turn", async () => {
    const { fn } = scriptedModel([
      modelTurn("", [toolCall("c1"), toolCall("c2", "file_search")]),
      modelTurn("done"),
    ]);
    const seen: string[] = [];
    const dispatchTool: DispatchTool = async (call) => {
      seen.push(call.id);
      return { output: "x", metering: { units: 1, unitLabel: "web_search" } };
    };
    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool,
    });
    expect(seen).toEqual(["c1", "c2"]);
    expect(res.stepsUsed).toBe(4); // model, tool, tool, model
  });

  it("records a failed tool step and feeds the error back without throwing", async () => {
    const { fn, calls } = scriptedModel([
      modelTurn("", [toolCall("c1")]),
      modelTurn("recovered"),
    ]);
    const dispatchTool: DispatchTool = async () => {
      throw new Error("boom");
    };
    const steps: LoopStep[] = [];

    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool,
      onStep: (s) => void steps.push(s),
    });

    const toolStep = steps.find((s) => s.stepType === "web_search")!;
    expect(toolStep.status).toBe("error");
    expect(toolStep.detail).toEqual({ error: "boom" });
    // Model sees the error as the tool message and recovers.
    const toolMsg = calls[1].find((m) => m.role === "tool")!;
    expect(toolMsg.content).toBe(JSON.stringify({ error: "boom" }));
    expect(res.finalText).toBe("recovered");
    expect(res.stopReason).toBe("final_answer");
  });
});

// ── T1.1c — cost / step guards ──────────────────────────────────────────────────

describe("runAgentLoop — guards", () => {
  it("halts at max_steps when the model never stops calling tools", async () => {
    const { fn } = scriptedModel([modelTurn("", [toolCall("c1")])]); // repeats
    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent({ maxSteps: 2 }),
      callModel: fn,
      dispatchTool: okDispatch(),
    });
    expect(res.stopReason).toBe("max_steps_exceeded");
    expect(res.modelTurns).toBe(2);
    expect(res.stepsUsed).toBe(4); // 2 model + 2 tool
  });

  it("cuts a runaway loop mid-run when cost reaches the ceiling", async () => {
    const { fn } = scriptedModel([modelTurn("", [toolCall("c1")])]); // repeats
    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent({ maxSteps: 100, maxCostCents: 100 }),
      callModel: fn,
      dispatchTool: okDispatch(),
      priceStep: () => 50, // every step costs 50c → model(50)+tool(100) then stop
    });
    expect(res.stopReason).toBe("max_cost_exceeded");
    expect(res.costCents).toBe(100);
    expect(res.modelTurns).toBe(1);
    expect(res.stepsUsed).toBe(2);
  });

  it("accumulates cost from priceStep and reports it on a normal finish", async () => {
    const { fn } = scriptedModel([modelTurn("", [toolCall("c1")]), modelTurn("ok")]);
    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool: okDispatch(),
      priceStep: (s) => (s.stepType === "model" ? 3 : 7),
    });
    expect(res.costCents).toBe(3 + 7 + 3); // model, tool, model
    expect(res.stopReason).toBe("final_answer");
  });

  it("defaults cost to 0 (only max_steps active) when priceStep is omitted", async () => {
    const { fn } = scriptedModel([modelTurn("done")]);
    const res = await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool: okDispatch(),
    });
    expect(res.costCents).toBe(0);
  });
});

// ── onStep trace ────────────────────────────────────────────────────────────────

describe("runAgentLoop — onStep trace", () => {
  it("emits an ordered step record per model turn and tool call", async () => {
    const { fn } = scriptedModel([modelTurn("", [toolCall("c1")]), modelTurn("done")]);
    const steps: LoopStep[] = [];
    await runAgentLoop({
      messages: [{ role: "user", content: "q" }],
      agent: agent(),
      callModel: fn,
      dispatchTool: okDispatch(),
      onStep: (s) => void steps.push(s),
    });
    expect(steps.map((s) => s.stepType)).toEqual(["model", "web_search", "model"]);
    expect(steps.map((s) => s.stepIndex)).toEqual([0, 1, 2]);
    expect(steps[0].inputTokens).toBe(10);
    expect(steps[1].metering).toEqual({ units: 1, unitLabel: "web_search" });
  });
});
