import { describe, it, expect, vi } from "vitest";
import type { RunCtx } from "@ahura/agent-core";
import type { RunnerEnv } from "../env.js";

// Fake gateway — no real network. Mirrors the pattern used elsewhere in this
// suite (MockSandboxPool, fake MCP clients): deterministic, no I/O, proves
// the tool's OWN orchestration logic rather than re-testing the gateway.
// mockDelayMs is mutable so the timeout test can simulate a slow/hung model
// turn without any other test needing to know about it.
let mockDelayMs = 0;
vi.mock("../gateway.js", () => ({
  makeCallModel:
    () =>
    async () => {
      if (mockDelayMs > 0) await new Promise((r) => setTimeout(r, mockDelayMs));
      return { content: "delegated answer", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } };
    },
}));

const { agentDelegateTool } = await import("../tools/agent-delegate.js");

const env = {
  toolTimeoutMs: 5000,
  allowPrivateWebhooks: false,
  mcpTokenDek: null,
  agentDelegateTimeoutMs: 60_000,
} as unknown as RunnerEnv;

const baseCtx: RunCtx = { runId: "parent-run", orgId: "org-1", billingUserId: "user-1", agentId: "parent-agent" };

interface FakeAgentRow {
  id: string;
  org_id: string;
  name: string;
  model: string;
  system_prompt: string | null;
  tools: unknown[];
  guardrail: string;
  max_steps: number;
  max_cost_cents: number;
  is_active: boolean;
}

/** Fake Supabase covering exactly the queries agent-delegate.ts issues:
 *  agentcore.agents select, agentcore.runs insert+update, agentcore.run_steps
 *  insert, inference.models select (pricing + agent/% tool rates). */
function fakeSupabase(
  agentRow: FakeAgentRow | null,
  opts: {
    rootMaxCostCents?: number;
    rootStepsSpentCents?: number;
    descendantsSpentCents?: number;
    rootCancelled?: boolean;
    stepInsertError?: boolean;
  } = {}
) {
  const runUpdates: Array<Record<string, unknown>> = [];
  const stepInserts: Array<Record<string, unknown>> = [];
  const heartbeatBumpIdSets: string[][] = [];
  let runInsertCount = 0;
  const rootMaxCostCents = opts.rootMaxCostCents ?? 1000;
  const rootStepsSpentCents = opts.rootStepsSpentCents ?? 0;
  const descendantsSpentCents = opts.descendantsSpentCents ?? 0;
  const rootCancelled = opts.rootCancelled ?? false;
  const stepInsertError = opts.stepInsertError ?? false;

  const supabase = {
    schema(name: string) {
      return {
        from(table: string) {
          if (name === "agentcore" && table === "agents") {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              maybeSingle: () => Promise.resolve({ data: agentRow }),
            };
          }
          if (name === "agentcore" && table === "runs") {
            return {
              // Three distinct shapes agent-delegate.ts issues against this
              // table: .select("max_cost_cents").eq("id", X).maybeSingle()
              // (the root's ceiling), .select("status").eq("id", X)
              // .maybeSingle() (the cancellation check), and .select(
              // "cost_cents").eq("root_run_id", X) awaited directly as an
              // array (already-finalized descendants' spend).
              select(cols: string) {
                const builder = {
                  eq() {
                    return builder;
                  },
                  maybeSingle: () => {
                    if (cols.includes("max_cost_cents")) return Promise.resolve({ data: { max_cost_cents: rootMaxCostCents } });
                    if (cols.includes("status")) return Promise.resolve({ data: { status: rootCancelled ? "cancelled" : "running" } });
                    return Promise.resolve({ data: null });
                  },
                  then(resolve: (v: unknown) => void) {
                    resolve({ data: descendantsSpentCents > 0 ? [{ cost_cents: descendantsSpentCents }] : [] });
                  },
                };
                return builder;
              },
              insert() {
                runInsertCount++;
                return {
                  select() {
                    return this;
                  },
                  single: () => Promise.resolve({ data: { id: `sub-run-${runInsertCount}` }, error: null }),
                };
              },
              update(patch: Record<string, unknown>) {
                runUpdates.push(patch);
                const builder = {
                  eq: () => builder,
                  in: (_col: string, ids: string[]) => {
                    if (patch.heartbeat_at) heartbeatBumpIdSets.push(ids);
                    return Promise.resolve({ error: null });
                  },
                  then(resolve: (v: unknown) => void) {
                    resolve({ error: null });
                  },
                };
                return builder;
              },
            };
          }
          if (name === "agentcore" && table === "run_steps") {
            return {
              // .select("cost_cents").eq("run_id", rootRunId) — the root's own live spend so far.
              select() {
                return { eq: () => Promise.resolve({ data: rootStepsSpentCents > 0 ? [{ cost_cents: rootStepsSpentCents }] : [] }) };
              },
              insert(row: Record<string, unknown>) {
                stepInserts.push(row);
                return Promise.resolve(stepInsertError ? { error: { message: "boom" } } : { error: null });
              },
            };
          }
          if (name === "inference" && table === "models") {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              like() {
                return Promise.resolve({ data: [] });
              },
              maybeSingle: () =>
                Promise.resolve({ data: { pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 } } }),
            };
          }
          throw new Error(`unexpected table ${name}.${table}`);
        },
      };
    },
  };
  return {
    supabase: supabase as never,
    runUpdates,
    stepInserts,
    heartbeatBumpIdSets,
    get runInsertCount() {
      return runInsertCount;
    },
  };
}

const targetAgent: FakeAgentRow = {
  id: "target-agent",
  org_id: "org-1",
  name: "Research Agent",
  model: "anthropic/claude-haiku-4.5",
  system_prompt: "You research things.",
  tools: [],
  guardrail: "off",
  max_steps: 5,
  max_cost_cents: 100,
  is_active: true,
};

describe("agentDelegateTool", () => {
  it("refuses to delegate past MAX_AGENT_DEPTH without touching the database", async () => {
    const { supabase, runInsertCount } = fakeSupabase(targetAgent);
    const tool = agentDelegateTool(
      { type: "agent", target_agent_id: "target-agent", label: "research" },
      { env, supabase }
    );
    const r = await tool.run({ input: "look into X" }, { ...baseCtx, depth: 3 });
    expect((r.output as { error: string }).error).toMatch(/depth limit/i);
    expect(runInsertCount).toBe(0);
  });

  it("rejects an empty input", async () => {
    const { supabase } = fakeSupabase(targetAgent);
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    const r = await tool.run({ input: "  " }, baseCtx);
    expect((r.output as { error: string }).error).toMatch(/non-empty/i);
  });

  it("refuses self-delegation", async () => {
    const { supabase } = fakeSupabase({ ...targetAgent, id: "parent-agent" });
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "parent-agent", label: "self" }, { env, supabase });
    const r = await tool.run({ input: "do a thing" }, baseCtx);
    expect((r.output as { error: string }).error).toMatch(/cannot delegate to itself/i);
  });

  // Found by the same review: nothing previously checked whether the customer
  // had cancelled the TOP-LEVEL (root) run while a delegation chain was
  // mid-flight — the nested loop would burn real compute to completion
  // regardless. Checked against the root specifically, since that's what
  // the customer's own Cancel button actually targets.
  it("stops and fails cleanly if the root run was cancelled mid-delegation", async () => {
    const { supabase, runUpdates } = fakeSupabase(targetAgent, { rootCancelled: true });
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    const r = await tool.run({ input: "look into X" }, baseCtx);
    expect((r.output as { error: string }).error).toMatch(/cancelled/i);
    const failedUpdate = runUpdates.find((u) => u.status === "failed");
    expect(failedUpdate).toBeTruthy(); // the sub-run row is finalized, not left dangling in 'running'
  });

  // Found by the same review: a hung/slow sub-agent would otherwise hold the
  // PARENT's one BullMQ concurrency slot hostage indefinitely — nothing
  // bounded how long this call could block. Proves the wall-clock cap
  // actually fires and the tool returns cleanly rather than hanging forever.
  it("times out a runaway delegated call instead of hanging the parent's job slot forever", async () => {
    mockDelayMs = 50; // the mocked model turn takes 50ms...
    const shortEnv = { ...env, agentDelegateTimeoutMs: 5 } as unknown as RunnerEnv; // ...cap is 5ms
    const { supabase } = fakeSupabase(targetAgent);
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env: shortEnv, supabase });
    const r = await tool.run({ input: "look into X" }, baseCtx);
    mockDelayMs = 0; // reset for every other test in this file
    expect((r.output as { error: string }).error).toMatch(/exceeded|timeout|timed out/i);
  });

  it("errors cleanly when the target agent doesn't exist or is disabled", async () => {
    const { supabase } = fakeSupabase(null);
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "ghost", label: "ghost" }, { env, supabase });
    const r = await tool.run({ input: "hello" }, baseCtx);
    expect((r.output as { error: string }).error).toMatch(/not found|disabled/i);
  });

  it("runs a real nested loop and returns the sub-agent's answer, always metered free at the tool-call level", async () => {
    const { supabase, runUpdates, stepInserts } = fakeSupabase(targetAgent);
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    const r = await tool.run({ input: "look into X" }, baseCtx);

    expect((r.output as { result: string }).result).toBe("delegated answer");
    expect(r.metering).toEqual({ units: 0, unitLabel: "agent_call" }); // never double-billed — see file header
    const detail = r.detail as { sub_run_id: string; target_agent: string; target_agent_id: string };
    expect(detail.sub_run_id).toBe("sub-run-1");
    expect(detail.target_agent).toBe("Research Agent");
    // Dashboard deep-links a delegation's sub_run_id to the target agent's own
    // Runs tab (?tab=runs&run=…) — needs the target's id, not just its name.
    expect(detail.target_agent_id).toBe("target-agent");

    // The sub-run got a real trace: at least one persisted step, and was
    // finalized 'completed' — not left dangling in 'running'.
    expect(stepInserts.length).toBeGreaterThan(0);
    const completedUpdate = runUpdates.find((u) => u.status === "completed");
    expect(completedUpdate).toBeTruthy();
  });

  // Regression guard (found during a duplication review, 2026-07-17): the
  // inline onStep here used to insert run_steps without checking the
  // result's `error` — a lost trace write would leave the sub-run silently
  // "completed" with missing steps, the exact failure mode lifecycle.ts's
  // persistStep already guards against for top-level runs. Fixed by routing
  // both through the shared insertRunStep (run-shared.ts), which throws.
  it("fails the sub-run loudly instead of silently losing steps when a run_steps insert fails", async () => {
    const { supabase, runUpdates } = fakeSupabase(targetAgent, { stepInsertError: true });
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    const r = await tool.run({ input: "look into X" }, baseCtx);

    expect((r.output as { error: string }).error).toMatch(/delegated agent run failed/i);
    const failedUpdate = runUpdates.find((u) => u.status === "failed");
    expect(failedUpdate).toBeTruthy();
    expect(runUpdates.some((u) => u.status === "completed")).toBe(false);
  });

  // Found by a pre-launch scalability review (2026-07-17): each run's own
  // max_cost_cents only ever bounded itself — nothing bounded the sum across
  // a whole delegation tree. Proves the fix: a tree that already spent its
  // shared root budget refuses a further delegate call, and never creates
  // (or bills for) a wasted sub-run row while doing so.
  it("refuses to delegate once the whole tree's spend reaches the root's shared budget", async () => {
    const { supabase, runInsertCount } = fakeSupabase(targetAgent, {
      rootMaxCostCents: 100,
      rootStepsSpentCents: 40,
      descendantsSpentCents: 65, // 40 + 65 = 105 >= 100
    });
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    const r = await tool.run({ input: "look into X" }, baseCtx);
    expect((r.output as { error: string }).error).toMatch(/shared budget/i);
    expect(runInsertCount).toBe(0);
  });

  it("allows delegation while the tree is still under its shared budget", async () => {
    const { supabase } = fakeSupabase(targetAgent, { rootMaxCostCents: 100, rootStepsSpentCents: 10, descendantsSpentCents: 5 });
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    const r = await tool.run({ input: "look into X" }, baseCtx);
    expect((r.output as { result?: string; error?: string }).error).toBeUndefined();
  });

  // Found by the same review: only bumping the immediate parent's heartbeat
  // leaves every run further up a multi-hop chain heartbeat-stale while a
  // deep nested call is in flight — the reaper (15-minute staleness cutoff)
  // has no way to know they're transitively still working. Proves every
  // ancestor in the chain, not just the direct parent, gets bumped.
  it("bumps heartbeat for the sub-run AND every ancestor up the chain on each nested step, not just the immediate parent", async () => {
    const { supabase, heartbeatBumpIdSets } = fakeSupabase(targetAgent);
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    // Simulate being two hops deep already (grandparent -> parent -> [this call]).
    const ctx: RunCtx = { ...baseCtx, runId: "run-B", depth: 1, ancestorRunIds: ["run-A"] };
    await tool.run({ input: "look into X" }, ctx);

    expect(heartbeatBumpIdSets.length).toBeGreaterThan(0);
    for (const ids of heartbeatBumpIdSets) {
      expect(ids).toContain("sub-run-1"); // the new sub-run itself
      expect(ids).toContain("run-B"); // immediate parent
      expect(ids).toContain("run-A"); // grandparent — the one a naive "just bump ctx.runId" fix would miss
    }
  });

  it("passes depth+1 down to the sub-run so a chain of delegations is trackable and eventually hits the cap", async () => {
    const { supabase } = fakeSupabase(targetAgent);
    const tool = agentDelegateTool({ type: "agent", target_agent_id: "target-agent", label: "research" }, { env, supabase });
    // depth 2 -> sub-run created at depth 3, which is still under MAX_AGENT_DEPTH (3)...
    // depth 3 -> refused outright (covered above). This proves the boundary is exact.
    const r = await tool.run({ input: "look into X" }, { ...baseCtx, depth: 2 });
    expect((r.output as { result?: string; error?: string }).error).toBeUndefined();
  });
});
