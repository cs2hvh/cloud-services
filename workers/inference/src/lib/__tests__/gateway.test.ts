import { describe, it, expect } from "vitest";
import { gatewayError, buildBaseEvent, checkModelScope } from "../gateway.ts";
import type { AuthContext } from "../../types.ts";

const mockAuth: AuthContext = {
  orgId:                     "org-123",
  keyId:                     "key-456",
  usageApiKeyId:             "key-456",
  agentId:                   null,
  keyTier:                   "private",
  allowedOrigins:            null,
  billing:                   "platform",
  allowedModels:             null,
  allowedIpCidrs:            null,
  zdrEnabled:                false,
  monthlyBudgetCents:        null,
  hardCapCents:              null,
  orgMonthlyBudgetCents:     null,
  orgHardCapCents:           null,
  semanticCacheEnabled:      false,
  orgSemanticCacheThreshold: null,
  rateLimitRpm:              null,
};

// ── gatewayError ─────────────────────────────────────────────────────────────

describe("gatewayError", () => {
  it("returns the expected shape", () => {
    const err = gatewayError("bad input", "invalid_request_error", "invalid_json", "req-1");
    expect(err).toEqual({
      error: {
        message:    "bad input",
        type:       "invalid_request_error",
        code:       "invalid_json",
        request_id: "req-1",
      },
    });
  });
});

// ── buildBaseEvent ────────────────────────────────────────────────────────────

describe("buildBaseEvent", () => {
  it("returns sensible defaults", () => {
    const startedAt = Date.now() - 100;
    const event = buildBaseEvent(mockAuth, "ahura/rerank-v3", "rerank", "req-1", startedAt);

    expect(event.orgId).toBe("org-123");
    expect(event.apiKeyId).toBe("key-456");
    expect(event.modelId).toBe("ahura/rerank-v3");
    expect(event.modality).toBe("rerank");
    expect(event.billedTo).toBe("platform");
    expect(event.status).toBe("success");
    expect(event.errorCode).toBeNull();
    expect(event.numUnits).toBeNull();
    expect(event.latencyMs).toBeGreaterThanOrEqual(100);
    expect(event.cacheKind).toBe("none");
    expect(event.occurredAt).toMatch(/^\d{4}-/);
  });

  it("overrides take precedence", () => {
    const event = buildBaseEvent(mockAuth, "ahura/model", "image", "req-2", Date.now(), {
      numUnits:  3,
      unitLabel: "image",
      status:    "error_upstream",
      errorCode: "upstream_503",
    });

    expect(event.numUnits).toBe(3);
    expect(event.unitLabel).toBe("image");
    expect(event.status).toBe("error_upstream");
    expect(event.errorCode).toBe("upstream_503");
    expect(event.billedTo).toBe("platform"); // not overridden
  });

  it("uses auth fields correctly", () => {
    const event = buildBaseEvent(mockAuth, "m", "ocr", "r", Date.now());
    expect(event.userId).toBeNull();
  });
});

// ── checkModelScope ───────────────────────────────────────────────────────────

describe("checkModelScope", () => {
  it("returns null when allowedModels is null", () => {
    expect(checkModelScope(mockAuth, "ahura/any-model", "req")).toBeNull();
  });

  it("returns null when allowedModels is empty array", () => {
    const auth = { ...mockAuth, allowedModels: [] };
    expect(checkModelScope(auth, "ahura/any-model", "req")).toBeNull();
  });

  it("returns null when model is in allowedModels", () => {
    const auth = { ...mockAuth, allowedModels: ["ahura/rerank-v3", "ahura/embed"] };
    expect(checkModelScope(auth, "ahura/rerank-v3", "req")).toBeNull();
  });

  it("returns error when model is NOT in allowedModels", () => {
    const auth = { ...mockAuth, allowedModels: ["ahura/embed"] };
    const err  = checkModelScope(auth, "ahura/rerank-v3", "req-id");
    expect(err).not.toBeNull();
    expect(err?.error.code).toBe("model_not_allowed");
    expect(err?.error.request_id).toBe("req-id");
    expect(err?.error.message).toContain("ahura/rerank-v3");
  });
});
