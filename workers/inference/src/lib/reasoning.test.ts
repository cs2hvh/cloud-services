import { describe, expect, it } from "vitest";
import { isReasoningEffort, reasoningControlsFromAnthropic } from "./reasoning.ts";

describe("reasoningControlsFromAnthropic", () => {
  it("says nothing when the request says nothing, so the pod default applies", () => {
    expect(reasoningControlsFromAnthropic({})).toEqual({});
    expect(reasoningControlsFromAnthropic({ thinking: null, output_config: null })).toEqual({});
  });

  it("maps output_config.effort onto reasoning_effort, only for values the pod knows", () => {
    expect(reasoningControlsFromAnthropic({ output_config: { effort: "medium" } })).toEqual({ reasoning_effort: "medium" });
    expect(reasoningControlsFromAnthropic({ output_config: { effort: "max" } })).toEqual({ reasoning_effort: "max" });
    expect(reasoningControlsFromAnthropic({ output_config: { effort: "turbo" } })).toEqual({});
  });

  it("maps a disabled thinking block onto no-think mode, overriding any effort", () => {
    expect(
      reasoningControlsFromAnthropic({ thinking: { type: "disabled" }, output_config: { effort: "high" } }),
    ).toEqual({ reasoning_effort: "none", enable_thinking: false });
  });

  it("maps budget_tokens onto an exact thinking budget", () => {
    expect(reasoningControlsFromAnthropic({ thinking: { type: "enabled", budget_tokens: 300 } })).toEqual({
      custom_params: { thinking_budget: 300 },
    });
    expect(reasoningControlsFromAnthropic({ thinking: { type: "enabled", budget_tokens: 2.9 } })).toEqual({
      custom_params: { thinking_budget: 2 },
    });
  });

  it("keeps both a budget and an effort when both are given; the pod lets the budget win", () => {
    expect(
      reasoningControlsFromAnthropic({ thinking: { type: "enabled", budget_tokens: 500 }, output_config: { effort: "low" } }),
    ).toEqual({ reasoning_effort: "low", custom_params: { thinking_budget: 500 } });
  });

  it("ignores a budget that is not a usable number", () => {
    expect(reasoningControlsFromAnthropic({ thinking: { type: "enabled", budget_tokens: -1 } })).toEqual({});
    expect(reasoningControlsFromAnthropic({ thinking: { type: "enabled" } })).toEqual({});
  });

  it("knows the ladder", () => {
    for (const v of ["none", "minimal", "off", "low", "medium", "high", "xhigh", "max"]) expect(isReasoningEffort(v)).toBe(true);
    expect(isReasoningEffort("MEDIUM")).toBe(false);
    expect(isReasoningEffort(3)).toBe(false);
  });
});
