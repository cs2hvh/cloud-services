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
}));

import { runAgentJob, type RunContext } from "../lifecycle.js";
import type { AgentJob } from "../scan.js";

// ── Minimal in-memory fake of the supabase-js query chains lifecycle uses. ──────
type Row = Record<string, unknown>;
type Filter = { col: string; val: unknown; kind: "eq" | "in" };

class Query {
  private op: "select" | "update" | "insert" = "select";
  private payload: Row = {};
  private filters: Filter[] = [];
  constructor(private table: Row[]) {}

  select() { if (this.op !== "update") this.op = "select"; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  insert(p: Row) { this.op = "insert"; this.payload = p; return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, val, kind: "eq" }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ col, val, kind: "in" }); return this; }

  private match(): Row[] {
    return this.table.filter((r) =>
      this.filters.every((f) =>
        f.kind === "eq" ? r[f.col] === f.val : (f.val as unknown[]).includes(r[f.col])
      )
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
  // Awaiting the builder directly (insert / update-without-terminal) applies + resolves.
  then(res: (v: { data: Row[]; error: null }) => void) { res({ data: this.run(), error: null }); }
}

function makeFakeSupabase(store: Record<string, Row[]>) {
  const tableFor = (schema: string, name: string) => (store[`${schema}.${name}`] ??= []);
  return {
    schema(schema: string) {
      return { from: (name: string) => new Query(tableFor(schema, name)) };
    },
  } as unknown as RunContext["supabase"];
}

const nullLogger = () => {
  const l: Record<string, unknown> = {};
  for (const m of ["info", "warn", "error", "debug", "fatal"]) l[m] = () => {};
  l.child = () => nullLogger();
  return l as unknown as RunContext["logger"];
};

function makeCtx(store: Record<string, Row[]>): RunContext {
  return { env: {} as RunContext["env"], supabase: makeFakeSupabase(store), logger: nullLogger(), podId: "test-pod" };
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
