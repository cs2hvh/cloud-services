import { describe, it, expect } from "vitest";
import { createAgentSchema, updateAgentSchema } from "@/lib/agentcore/agent-schema";

// Doc: nextstespsAI/12-agent-execution-stages.md (T1.4b)

describe("createAgentSchema", () => {
  it("accepts a minimal valid agent", () => {
    expect(createAgentSchema.safeParse({ name: "Research", model: "openai/gpt-4o" }).success).toBe(true);
  });

  it("accepts full config with tools + guardrail + budgets", () => {
    const r = createAgentSchema.safeParse({
      name: "Analyst",
      model: "openai/gpt-4o",
      system_prompt: "Be concise.",
      tools: [{ type: "web_search" }, { type: "file_search", collection: "kb1" }],
      guardrail: "block",
      max_steps: 20,
      max_cost_cents: 500,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing name/model", () => {
    expect(createAgentSchema.safeParse({ model: "m" }).success).toBe(false);
    expect(createAgentSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("rejects an unknown tool type", () => {
    expect(
      createAgentSchema.safeParse({ name: "x", model: "m", tools: [{ type: "browser" }] }).success
    ).toBe(false);
  });

  // Regression guard (found live, 2026-07-17): this enum was the one thing
  // standing between a fully-built runner-side agent-delegate feature and
  // it being completely unreachable through the real API — every create/
  // update request declaring an "agent" tool would have been rejected here
  // before ever reaching the database or the runner.
  it("accepts an agent-delegate tool decl", () => {
    const r = createAgentSchema.safeParse({
      name: "Coordinator",
      model: "openai/gpt-4o",
      tools: [{ type: "agent", target_agent_id: "11111111-1111-1111-1111-111111111111", label: "research" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects out-of-range max_steps / non-positive max_cost_cents", () => {
    expect(createAgentSchema.safeParse({ name: "x", model: "m", max_steps: 101 }).success).toBe(false);
    expect(createAgentSchema.safeParse({ name: "x", model: "m", max_cost_cents: 0 }).success).toBe(false);
  });
});

describe("updateAgentSchema", () => {
  it("accepts a partial patch", () => {
    expect(updateAgentSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateAgentSchema.safeParse({ max_cost_cents: 250 }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(updateAgentSchema.safeParse({}).success).toBe(false);
  });
});
