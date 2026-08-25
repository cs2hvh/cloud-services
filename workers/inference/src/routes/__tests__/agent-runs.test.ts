import { describe, it, expect } from "vitest";
import { redactForPublicTier, extractFinalText } from "../agent-runs.ts";

// Doc: manager ask 2026-07-08 — a public-tier key's response must never
// carry cost_cents/step internals (anyone visiting the customer's website
// can open devtools and read it). Pure function, no Hono context needed.
//
// `output` below matches the REAL shape agent-runner's finalizeCompleted()
// writes (workers/agent-runner/src/lifecycle.ts) — found live (2026-07-08)
// that this envelope embeds its OWN cost/step fields as siblings of the
// reply text (x_ahura_cost_cents, steps), which the first redaction pass
// missed entirely since it only touched the wrapper, not this nested object.

const REAL_OUTPUT_SHAPE = {
  id: "run_1",
  object: "response",
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: "Refunds are available within 30 days." }] }],
  usage: { input_tokens: 34, output_tokens: 44, tools: {} },
  steps: 1,
  x_ahura_cost_cents: 0.0032,
};

const baseRun = {
  id: "run_1",
  object: "response" as const,
  status: "completed",
  error: null,
  cost_cents: 42,
  step_count: 3,
  created_at: "2026-07-08T00:00:00Z",
  updated_at: "2026-07-08T00:00:05Z",
  output: REAL_OUTPUT_SHAPE,
  steps: [
    { step_index: 0, step_type: "model", tool_name: null, input_tokens: 10, output_tokens: 5, units: null, unit_label: null, cost_cents: 42, latency_ms: 100, status: "ok", detail: null, created_at: "2026-07-08T00:00:01Z" },
  ],
};

describe("extractFinalText", () => {
  it("pulls the reply text out of the real internal envelope shape", () => {
    expect(extractFinalText(REAL_OUTPUT_SHAPE)).toBe("Refunds are available within 30 days.");
  });

  it("returns null for a null/malformed output", () => {
    expect(extractFinalText(null)).toBeNull();
    expect(extractFinalText({})).toBeNull();
  });
});

describe("redactForPublicTier", () => {
  it("returns the run untouched for a private key", () => {
    const result = redactForPublicTier(baseRun, false);
    expect(result).toEqual(baseRun);
    expect("cost_cents" in result).toBe(true);
    expect((result as typeof baseRun).steps).toHaveLength(1);
    // Private key: the full internal envelope, cost/steps included.
    expect((result.output as typeof REAL_OUTPUT_SHAPE).x_ahura_cost_cents).toBe(0.0032);
  });

  it("strips cost_cents, step_count, and steps entirely for a public key", () => {
    const result = redactForPublicTier(baseRun, true);
    expect("cost_cents" in result).toBe(false);
    expect("step_count" in result).toBe(false);
    expect("steps" in result).toBe(false);
    // Everything else survives — the assistant's actual reply — but the
    // nested envelope's OWN cost/step fields must be gone too (this is the
    // exact bug found live: x_ahura_cost_cents/steps used to leak here).
    expect(result.id).toBe("run_1");
    expect(result.status).toBe("completed");
    expect(result.output).toEqual({ text: "Refunds are available within 30 days." });
    expect(JSON.stringify(result.output)).not.toContain("x_ahura_cost_cents");
    expect(JSON.stringify(result.output)).not.toContain("0.0032");
  });

  it("replaces a failed run's raw internal error with a generic message for a public key", () => {
    const failedRun = { ...baseRun, status: "failed", error: "TypeError: fetch failed at persistStep (lifecycle.ts:530)" };
    const result = redactForPublicTier(failedRun, true);
    expect(result.error).toBe("The agent could not complete this request.");
    expect(result.error).not.toContain("TypeError");
  });

  it("keeps the raw internal error for a private key (full visibility)", () => {
    const failedRun = { ...baseRun, status: "failed", error: "TypeError: fetch failed at persistStep (lifecycle.ts:530)" };
    const result = redactForPublicTier(failedRun, false);
    expect(result.error).toBe("TypeError: fetch failed at persistStep (lifecycle.ts:530)");
  });

  it("leaves error as null for a successful public-tier run (nothing to redact)", () => {
    const result = redactForPublicTier(baseRun, true);
    expect(result.error).toBeNull();
  });
});
