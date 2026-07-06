/**
 * Integration test for the agent-runner lifecycle (runAgentJob) — T1.3d/e.
 *
 * Exercises the FULL runner brain end-to-end with NO Supabase and NO network:
 *   claim (queued→running) → resolveConfig → fetchModelPricing → runAgentLoop
 *   → persist run_steps + heartbeat → finalize (completed / failed).
 *
 * The DB is a tiny in-memory fake of the exact supabase-js chains lifecycle uses;
 * the gateway (model turn) is mocked so runs are deterministic. gateway.ts itself
 * is covered separately in gateway.test.ts, and a real model turn is smoke-tested
 * against the live worker — this file proves the orchestration between them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the gateway module so model turns are deterministic (no network). ──────
const { model } = vi.hoisted(() => ({
  model: {
    fn: async (_msgs: unknown) => ({
      content: "final answer",
      toolCalls: [] as unknown[],
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  },
}));
vi.mock("../gateway.js", () => ({
  makeCallModel: () => (msgs: unknown) => model.fn(msgs),
  // Fixed 1536-dim embedding — the fake RPC below returns canned rows regardless
  // of the actual vector, so its value doesn't need to vary per test.
  embedText: async () => ({ embedding: Array(1536).fill(0.01), tokens: 3 }),
}));

import { runAgentJob, priceStep, type RunContext } from "../lifecycle.js";
import type { AgentJob } from "../scan.js";
import type { LoopStep } from "@ahura/agent-core";

// ── Minimal in-memory fake of the supabase-js query chains lifecycle uses. ──────
type Row = Record<string, unknown>;
type Filter = { col: string; val: unknown; kind: "eq" | "in" | "like" };

class Query {
  private op: "select" | "update" | "insert" = "select";
  private payload: Row = {};
  private filters: Filter[] = [];
  private wantCount = false;
  constructor(private table: Row[]) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "update") this.op = "select";
    if (opts?.count) this.wantCount = true;
    return this;
  }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  insert(p: Row) { this.op = "insert"; this.payload = p; return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, val, kind: "eq" }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ col, val, kind: "in" }); return this; }
  like(col: string, val: string) { this.filters.push({ col, val, kind: "like" }); return this; }

  private match(): Row[] {
    return this.table.filter((r) =>
      this.filters.every((f) => {
        if (f.kind === "eq") return r[f.col] === f.val;
        if (f.kind === "in") return (f.val as unknown[]).includes(r[f.col]);
        // like: SQL '%' wildcard → regex
        const re = new RegExp("^" + String(f.val).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$");
        return re.test(String(r[f.col]));
      })
    );
  }
  private run(): Row[] {
    if (this.op === "insert") { const row = { id: `row_${this.table.length + 1}`, ...this.payload }; this.table.push(row); return [row]; }
    const matched = this.match();
    if (this.op === "update") { matched.forEach((r) => Object.assign(r, this.payload)); }
    return matched.map((r) => ({ ...r }));
  }
  maybeSingle<T>() { const r = this.run(); return { data: (r[0] ?? null) as T | null, error: null }; }
  single<T>() { const r = this.run(); return { data: (r[0] ?? null) as T | null, error: r[0] ? null : { message: "no rows" } }; }
  // Awaiting the builder directly (insert / update-without-terminal / count-only
  // select like hasAnyMemories) applies + resolves.
  then(res: (v: { data: Row[]; error: null; count?: number }) => void) {
    const r = this.run();
    res({ data: r, error: null, ...(this.wantCount ? { count: r.length } : {}) });
  }
}

function makeFakeSupabase(store: Record<string, Row[]>, rpc: Record<string, unknown[]> = {}) {
  const tableFor = (schema: string, name: string) => (store[`${schema}.${name}`] ??= []);
  return {
    schema(schema: string) {
      return {
        from: (name: string) => new Query(tableFor(schema, name)),
        // Fake search_agent_memories: canned rows per test, real cosine math
        // isn't exercised here (that's covered live + by the RPC's own SQL);
        // this tests lifecycle's OWN wiring (threshold filter, step, injection).
        rpc: async (fn: string) => ({ data: rpc[fn] ?? [], error: null }),
      };
    },
  } as unknown as RunContext["supabase"];
}

const nullLogger = () => {
  const l: Record<string, unknown> = {};
  for (const m of ["info", "warn", "error", "debug", "fatal"]) l[m] = () => {};
  l.child = () => nullLogger();
  return l as unknown as RunContext["logger"];
};

function makeCtx(store: Record<string, Row[]>, rpc: Record<string, unknown[]> = {}): RunContext {
  return { env: {} as RunContext["env"], supabase: makeFakeSupabase(store, rpc), logger: nullLogger(), podId: "test-pod" };
}

const JOB: AgentJob = { runId: "run_1", orgId: "org_1" };

function seedRun(store: Record<string, Row[]>, over: Row = {}) {
  store["agentcore.runs"] = [{
    id: "run_1", org_id: "org_1", agent_id: null, billing_user_id: "user_1",
    input: { model: "openai/gpt-4.1-mini", input: "hello" },
    max_cost_cents: 100, status: "queued", step_count: 0, cost_cents: 0,
    ...over,
  }];
  store["agentcore.run_steps"] = [];
  store["inference.models"] = [{ model_id: "openai/gpt-4.1-mini", pricing: { input_cents_per_mtok: 30, output_cents_per_mtok: 60 } }];
}

describe("runAgentJob (lifecycle integration)", () => {
  beforeEach(() => {
    model.fn = async () => ({ content: "final answer", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it("happy path: claims, runs one model turn, persists step, completes", async () => {
    const store: Record<string, Row[]> = {};
    seedRun(store);

    await runAgentJob(makeCtx(store), JOB);

    const run = store["agentcore.runs"][0];
    expect(run.status).toBe("completed");
    expect(run.step_count).toBe(1);
    const output = run.output as { output: Array<{ content: Array<{ text: string }> }> };
    expect(output.output[0].content[0].text).toBe("final answer");

    const steps = store["agentcore.run_steps"];
    expect(steps).toHaveLength(1);
    expect(steps[0].step_type).toBe("model");
    expect(steps[0].input_tokens).toBe(10);
  });

  it("double-claim: an already-running run is skipped (no work, no steps)", async () => {
    const store: Record<string, Row[]> = {};
    seedRun(store, { status: "running" }); // another replica already claimed it

    await runAgentJob(makeCtx(store), JOB);

    expect(store["agentcore.runs"][0].status).toBe("running"); // untouched
    expect(store["agentcore.run_steps"]).toHaveLength(0);
  });

  it("cost ceiling: a looping model is cut off mid-run and marked failed", async () => {
    const store: Record<string, Row[]> = {};
    seedRun(store, { max_cost_cents: 1 });
    // Expensive turn that always requests a tool → loop never final-answers,
    // so the mid-run cost gate is what must stop it.
    store["inference.models"][0].pricing = { input_cents_per_mtok: 1_000_000, output_cents_per_mtok: 0 };
    model.fn = async () => ({
      content: "",
      toolCalls: [{ id: "c1", type: "function", name: "noop", arguments: "{}" }],
      usage: { inputTokens: 100, outputTokens: 0 },
    });

    await runAgentJob(makeCtx(store), JOB);

    const run = store["agentcore.runs"][0];
    expect(run.status).toBe("failed");
    expect(run.error).toBe("max_cost_exceeded");
  });
});

// priceStep must count TOOL spend (not just model tokens) toward the ceiling —
// else a tool-heavy agent could run past max_cost_cents. (§9 mid-run guard.)
describe("priceStep", () => {
  const modelPricing = { input_cents_per_mtok: 30, output_cents_per_mtok: 60 };
  const toolRates = { web_search: 1, function_call: 0.02 };

  it("prices a model step by token usage", () => {
    const step = { stepType: "model", inputTokens: 1_000_000, outputTokens: 0, status: "success", stepIndex: 0 } as LoopStep;
    expect(priceStep(step, modelPricing, toolRates)).toBeCloseTo(30);
  });

  it("prices a tool step by units × per-label rate", () => {
    const ws = { stepType: "web_search", metering: { units: 1, unitLabel: "web_search" }, status: "success", stepIndex: 1 } as LoopStep;
    expect(priceStep(ws, modelPricing, toolRates)).toBe(1);
    const fn = { stepType: "function", metering: { units: 3, unitLabel: "function_call" }, status: "success", stepIndex: 2 } as LoopStep;
    expect(priceStep(fn, modelPricing, toolRates)).toBeCloseTo(0.06);
  });

  it("returns 0 for an unpriced tool label (no rate configured)", () => {
    const step = { stepType: "file_search", metering: { units: 1, unitLabel: "file_search" }, status: "success", stepIndex: 3 } as LoopStep;
    expect(priceStep(step, modelPricing, toolRates)).toBe(0);
  });
});

// ── auto-recall (memory) ────────────────────────────────────────────────────
// Proactive recall (inject before the loop runs) instead of relying on the
// model to call the memory tool — see lifecycle.ts §3b. These tests cover the
// NEW similarity-threshold gate: an unrelated "closest" hit must not be
// injected just because top-K always returns something.
const AGENT_ID = "agent_mem_1";

/** Seed a defined agent with the memory tool attached + one dummy stored
 *  memory row (so hasAnyMemories() short-circuits true and the mocked RPC
 *  in `rpc` decides what's "found"). */
function seedMemoryAgent(store: Record<string, Row[]>, zdr = false) {
  store["agentcore.agents"] = [{
    id: AGENT_ID, model: "openai/gpt-4.1-mini", system_prompt: "Be helpful.",
    tools: [{ type: "memory" }], max_steps: 12, guardrail: "warn",
  }];
  store["agentcore.agent_memories"] = [{ id: "m0", agent_id: AGENT_ID, scope_key: "default" }];
  store["inference.orgs"] = [{ id: "org_1", zdr_default: zdr }];
  store["agentcore.runs"][0].agent_id = AGENT_ID;
}

describe("auto-recall (memory)", () => {
  beforeEach(() => {
    model.fn = async () => ({ content: "final answer", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it("injects recalled facts + persists a billed step 0 when similarity clears the threshold", async () => {
    const store: Record<string, Row[]> = {};
    seedRun(store, { input: { input: "what is my name?" } });
    seedMemoryAgent(store);
    const seenMessages: unknown[] = [];
    model.fn = async (msgs) => { seenMessages.push(msgs); return { content: "You're Deep.", toolCalls: [], usage: { inputTokens: 20, outputTokens: 5 } }; };

    await runAgentJob(
      makeCtx(store, { search_agent_memories: [{ id: "m1", content: "User's name is Deep.", similarity: 0.4 }] }),
      JOB
    );

    const run = store["agentcore.runs"][0];
    expect(run.status).toBe("completed");
    const steps = store["agentcore.run_steps"];
    expect(steps).toHaveLength(2); // auto-recall (0) + model (1)
    expect(steps[0]).toMatchObject({ step_index: 0, step_type: "memory", tool_name: "memory" });
    expect((steps[0].detail as { action: string }).action).toBe("auto_recall");
    // The recalled fact must actually reach the model's transcript.
    const firstCallMessages = seenMessages[0] as Array<{ role: string; content: string }>;
    expect(firstCallMessages.some((m) => m.role === "system" && m.content.includes("User's name is Deep."))).toBe(true);
  });

  it("does NOT inject or persist a step when the best match is below the relevance threshold", async () => {
    const store: Record<string, Row[]> = {};
    seedRun(store, { input: { input: "what is the weather today?" } });
    seedMemoryAgent(store);

    // Top-K always returns *something* — here it's the agent's stored fact,
    // but it's unrelated to the question, so similarity is low (below 0.15).
    await runAgentJob(
      makeCtx(store, { search_agent_memories: [{ id: "m1", content: "User's favorite color is teal.", similarity: 0.04 }] }),
      JOB
    );

    const steps = store["agentcore.run_steps"];
    expect(steps).toHaveLength(1); // model only — no stray auto_recall step
    expect(steps[0].step_type).toBe("model");
  });

  it("skips auto-recall entirely for a ZDR org (no injected message, no extra step)", async () => {
    const store: Record<string, Row[]> = {};
    seedRun(store, { input: { input: "what is my name?" } });
    seedMemoryAgent(store, /* zdr */ true);

    await runAgentJob(
      makeCtx(store, { search_agent_memories: [{ id: "m1", content: "User's name is Deep.", similarity: 0.9 }] }),
      JOB
    );

    const steps = store["agentcore.run_steps"];
    expect(steps).toHaveLength(1);
    expect(steps[0].step_type).toBe("model");
  });
});
