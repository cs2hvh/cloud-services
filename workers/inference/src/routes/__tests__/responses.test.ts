import { describe, it, expect } from "vitest";
import { responsesSchema, agentRunSchema } from "../responses.ts";

// Doc: nextstespsAI/12-agent-execution-stages.md (T1.2a)
// The required-field contract that keeps a run from being enqueued without a
// cost ceiling (§9 requires max_cost_cents when there's no stored agent).

describe("responsesSchema", () => {
  it("accepts an inline request with model + max_cost_cents", () => {
    const r = responsesSchema.safeParse({ model: "test/model", input: "hi", max_cost_cents: 100 });
    expect(r.success).toBe(true);
  });

  it("accepts an agent_id request without model/max_cost_cents (agent carries them)", () => {
    const r = responsesSchema.safeParse({
      agent_id: "11111111-1111-1111-1111-111111111111",
      input: "hi",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a request with neither agent_id nor model", () => {
    const r = responsesSchema.safeParse({ input: "hi", max_cost_cents: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects an inline request missing max_cost_cents (no cost ceiling)", () => {
    const r = responsesSchema.safeParse({ model: "test/model", input: "hi" });
    expect(r.success).toBe(false);
  });

  it("rejects empty input", () => {
    const r = responsesSchema.safeParse({ model: "test/model", input: "", max_cost_cents: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects max_cost_cents <= 0", () => {
    const r = responsesSchema.safeParse({ model: "test/model", input: "hi", max_cost_cents: 0 });
    expect(r.success).toBe(false);
  });

  it("accepts a message-array input", () => {
    const r = responsesSchema.safeParse({
      model: "test/model",
      input: [{ role: "user", content: "hi" }],
      max_cost_cents: 100,
    });
    expect(r.success).toBe(true);
  });
});

describe("agentRunSchema", () => {
  it("requires input", () => {
    expect(agentRunSchema.safeParse({}).success).toBe(false);
    expect(agentRunSchema.safeParse({ input: "go" }).success).toBe(true);
  });
});
