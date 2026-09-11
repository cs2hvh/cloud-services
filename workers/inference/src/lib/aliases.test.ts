/**
 * Alias resolution: the thing standing between a renamed model and every
 * integration that typed the old id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    schema: () => ({ from: () => ({ select: selectMock }) }),
  }),
}));

const { aliasesByModel, aliasMap, resetAliasCache, resolveModelId } = await import("./aliases.ts");

const env = { SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" } as never;
const rows = (data: { alias: string; model_id: string }[]) => ({
  returns: () => Promise.resolve({ data, error: null }),
});

beforeEach(() => {
  resetAliasCache();
  selectMock.mockReset();
});

describe("resolveModelId", () => {
  it("maps a retired id to what it became", async () => {
    selectMock.mockReturnValue(
      rows([{ alias: "zhipu/glm-5.3-flash-uncensored", model_id: "zhipu/glm-5.3-flash-derisked" }])
    );
    expect(await resolveModelId(env, "zhipu/glm-5.3-flash-uncensored")).toBe(
      "zhipu/glm-5.3-flash-derisked"
    );
  });

  it("passes through an id that is not an alias", async () => {
    selectMock.mockReturnValue(rows([]));
    expect(await resolveModelId(env, "anthropic/claude-haiku-4.5")).toBe(
      "anthropic/claude-haiku-4.5"
    );
  });

  it("does not chain one alias into another", async () => {
    // b is retired to c, and a is retired to b. One hop only: resolving a
    // twice would make the map order-dependent and the result unstable.
    selectMock.mockReturnValue(rows([{ alias: "a", model_id: "b" }, { alias: "b", model_id: "c" }]));
    expect(await resolveModelId(env, "a")).toBe("b");
  });

  it("reads the table once per minute, not once per request", async () => {
    selectMock.mockReturnValue(rows([{ alias: "old", model_id: "new" }]));
    await resolveModelId(env, "old");
    await resolveModelId(env, "old");
    await resolveModelId(env, "other");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent first requests into one query", async () => {
    selectMock.mockReturnValue(rows([{ alias: "old", model_id: "new" }]));
    const [a, b, c] = await Promise.all([
      resolveModelId(env, "old"),
      resolveModelId(env, "old"),
      resolveModelId(env, "old"),
    ]);
    expect([a, b, c]).toEqual(["new", "new", "new"]);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("serves the last good map when a refresh fails", async () => {
    selectMock.mockReturnValue(rows([{ alias: "old", model_id: "new" }]));
    await resolveModelId(env, "old");

    // Expire the cache, then fail the refresh.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    selectMock.mockReturnValue({
      returns: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    expect(await resolveModelId(env, "old")).toBe("new");
    vi.useRealTimers();
  });

  it("is a pass-through, not a failure, when nothing is known", async () => {
    selectMock.mockReturnValue({
      returns: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    expect(await resolveModelId(env, "zhipu/glm-5.3-flash-derisked")).toBe(
      "zhipu/glm-5.3-flash-derisked"
    );
  });

  it("leaves an empty model id alone", async () => {
    selectMock.mockReturnValue(rows([]));
    expect(await resolveModelId(env, "")).toBe("");
    expect(selectMock).not.toHaveBeenCalled();
  });
});

describe("aliasesByModel", () => {
  it("groups retired ids under the model they point at, sorted", async () => {
    selectMock.mockReturnValue(
      rows([
        { alias: "zhipu/glm-5.3-flash-uncensored", model_id: "zhipu/glm-5.3-flash-derisked" },
        { alias: "zhipu/glm-5.3-flash", model_id: "zhipu/glm-5.3-flash-derisked" },
        { alias: "old/qwen", model_id: "qwen/new" },
      ])
    );
    const byModel = await aliasesByModel(env);
    expect(byModel.get("zhipu/glm-5.3-flash-derisked")).toEqual([
      "zhipu/glm-5.3-flash",
      "zhipu/glm-5.3-flash-uncensored",
    ]);
    expect(byModel.get("qwen/new")).toEqual(["old/qwen"]);
    expect(byModel.get("anthropic/claude-haiku-4.5")).toBeUndefined();
  });

  it("returns an empty map when there are no aliases", async () => {
    selectMock.mockReturnValue(rows([]));
    expect((await aliasMap(env)).size).toBe(0);
    expect((await aliasesByModel(env)).size).toBe(0);
  });
});
