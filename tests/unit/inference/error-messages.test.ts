import { describe, it, expect } from "vitest";
import { customerSafeErrorMessage, stripInfraIdentifiers } from "@/lib/inference/error-messages";

describe("stripInfraIdentifiers", () => {
  it("strips known infra/vendor identifiers", () => {
    expect(stripInfraIdentifiers("running on RunPod via kubectl")).not.toMatch(/runpod|kubectl/i);
    expect(stripInfraIdentifiers("OpenRouter returned a 500")).not.toMatch(/openrouter/i);
    expect(stripInfraIdentifiers("pulled ghcr.io/ahura/train:latest")).not.toMatch(/ghcr\.io/i);
    expect(stripInfraIdentifiers("see ft-runner logs")).not.toMatch(/ft-runner/i);
    expect(stripInfraIdentifiers("OPENROUTER_PLATFORM_KEY=sk-abc")).not.toMatch(/OPENROUTER_PLATFORM_KEY/);
  });

  it("strips absolute unix paths that could reveal internal layout", () => {
    expect(stripInfraIdentifiers("saved to /workspace/cache/model/checkpoint-100")).not.toMatch(/\/workspace/);
  });

  // Found live (2026-07-17): this used to be the only path a training log
  // ever went through — customerSafeErrorMessage's canned-message branches
  // were tuned for short error strings; applying THOSE to a full multi-KB
  // log would have collapsed the whole thing into one generic sentence the
  // moment it contained the word "traceback" anywhere in 10,000 lines.
  it("does not collapse arbitrary long text into a canned message the way customerSafeErrorMessage would", () => {
    const log = "epoch 1/3 loss=0.42\nepoch 2/3 loss=0.31\nTraceback (most recent call last):\nepoch 3/3 loss=0.20\n";
    const scrubbed = stripInfraIdentifiers(log);
    expect(scrubbed).toContain("loss=0.42");
    expect(scrubbed).toContain("loss=0.20");
  });
});

describe("customerSafeErrorMessage", () => {
  it("still maps known patterns to friendly copy (unchanged after the refactor)", () => {
    expect(customerSafeErrorMessage("heartbeat lost")).toMatch(/stopped responding/i);
    expect(customerSafeErrorMessage("CUDA out of memory")).toMatch(/too large for the selected GPU/i);
  });

  it("falls through to stripInfraIdentifiers for anything else", () => {
    expect(customerSafeErrorMessage("weird RunPod thing happened")).not.toMatch(/runpod/i);
  });

  it("returns empty string for null/undefined", () => {
    expect(customerSafeErrorMessage(null)).toBe("");
    expect(customerSafeErrorMessage(undefined)).toBe("");
  });
});
