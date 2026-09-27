import { describe, expect, it } from "vitest";
import { isSafeModelId, modelIdSchema } from "./model-id.ts";

describe("model id shape", () => {
  it("accepts every shape the catalog uses", () => {
    for (const id of [
      "zhipu/GLM-5.3-derisked",
      "anthropic/claude-opus-5.5",
      "openai/gpt-6-astra",
      "qwen/qwen3.8-flash-next-uncensored",
      "google/gemini-3-pro:online",
      "black-forest-labs/flux.2-pro",
      "org@team/model+v2",
    ]) {
      expect(isSafeModelId(id), id).toBe(true);
      expect(modelIdSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it("refuses ids that could break the batch pricing lookup", () => {
    for (const id of [
      "",
      "a".repeat(129),
      "model,other",
      "model)",
      'model"',
      "model with space",
      "model\nnext",
      "model%2C",
    ]) {
      expect(isSafeModelId(id), JSON.stringify(id)).toBe(false);
      expect(modelIdSchema.safeParse(id).success, JSON.stringify(id)).toBe(false);
    }
  });

  it("is not fooled by non-strings", () => {
    expect(isSafeModelId(undefined)).toBe(false);
    expect(isSafeModelId(42)).toBe(false);
    expect(isSafeModelId(null)).toBe(false);
  });
});
