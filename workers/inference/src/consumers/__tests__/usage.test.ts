import { describe, it, expect } from "vitest";
import { computeUnitCost } from "../usage.ts";
import type { UsageEvent } from "../../types.ts";

// Doc: nextstespsAI/12-agent-execution-stages.md (T0.4)
// Proves agentcore hosted-tool steps price through the SAME usage pipeline as
// every other per-unit modality — no parallel queue (doc 09 §2.B).

function agentEvent(unitLabel: string, numUnits: number): UsageEvent {
  return {
    orgId: "org_1",
    apiKeyId: "key_1",
    userId: "user_1",
    modelId: "agent/web-search",
    modality: "chat", // irrelevant to computeUnitCost; it switches on unitLabel
    requestId: "req_1",
    billedTo: "platform",
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    numUnits,
    unitLabel,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: 0,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    occurredAt: new Date().toISOString(),
  };
}

describe("computeUnitCost — agentcore tool labels", () => {
  it("prices web_search per search", () => {
    // 3 searches × 1 cent = 3
    expect(computeUnitCost(agentEvent("web_search", 3), { cents_per_web_search: 1 })).toBe(3);
  });

  it("prices cpu_second per CPU-second (rounded up)", () => {
    // 4.2 cpu-sec × 0.06 = 0.252 → ceil → 1
    expect(computeUnitCost(agentEvent("cpu_second", 4.2), { cents_per_cpu_second: 0.06 })).toBe(1);
    // 100 cpu-sec × 0.06 = 6
    expect(computeUnitCost(agentEvent("cpu_second", 100), { cents_per_cpu_second: 0.06 })).toBe(6);
  });

  it("prices function_call per call (rounded up so it never undercounts)", () => {
    // 1 call × 0.02 = 0.02 → ceil → 1 (micro-amounts round up, per computeCost contract)
    expect(computeUnitCost(agentEvent("function_call", 1), { cents_per_function_call: 0.02 })).toBe(1);
  });

  it("returns 0 when the matching rate is absent", () => {
    expect(computeUnitCost(agentEvent("web_search", 3), {})).toBe(0);
  });

  it("returns 0 for zero/negative units", () => {
    expect(computeUnitCost(agentEvent("web_search", 0), { cents_per_web_search: 1 })).toBe(0);
  });
});
