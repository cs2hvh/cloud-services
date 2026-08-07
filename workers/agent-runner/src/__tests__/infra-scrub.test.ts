import { describe, it, expect } from "vitest";
import { scrubInfraLeakage } from "../tools/infra-scrub.js";

describe("scrubInfraLeakage", () => {
  it("strips known infra/vendor identifiers", () => {
    expect(scrubInfraLeakage("running on RunPod via kubectl")).not.toMatch(/runpod|kubectl/i);
    expect(scrubInfraLeakage("OpenRouter returned a 500")).not.toMatch(/openrouter/i);
    expect(scrubInfraLeakage("pulled ghcr.io/ahura/train:latest")).not.toMatch(/ghcr\.io/i);
    expect(scrubInfraLeakage("see agent-runner logs")).not.toMatch(/agent-runner/i);
    expect(scrubInfraLeakage("SUPABASE_SERVICE_ROLE_KEY=abc")).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("strips K8s-shaped internal DNS names", () => {
    expect(scrubInfraLeakage("connect to billing-svc.ahura.svc.cluster.local:5432")).not.toMatch(
      /svc\.cluster\.local/i
    );
  });

  it("leaves ordinary customer-authored text untouched", () => {
    expect(scrubInfraLeakage("The result is 42")).toBe("The result is 42");
    expect(scrubInfraLeakage("my pod of dolphins")).toContain("pod of dolphins"); // not over-aggressive
  });

  it("handles empty/null-ish input without throwing", () => {
    expect(scrubInfraLeakage("")).toBe("");
  });
});
