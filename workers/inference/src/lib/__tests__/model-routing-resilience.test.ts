import { describe, it, expect, vi } from "vitest";

// Two failure shapes: the column is missing (migration not applied) and the
// catalog is genuinely unreadable.
const calls: string[] = [];
let missingColumn = true;
let totallyBroken = false;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: (cols: string) => {
          calls.push(cols);
          return {
            eq: () => ({
              maybeSingle: async () => {
                if (totallyBroken) return { data: null, error: new Error("connection refused") };
                if (missingColumn && cols.includes("preferred_provider")) {
                  return { data: null, error: new Error('column "preferred_provider" does not exist') };
                }
                return {
                  data: {
                    serving_type: "proxy", serving_url: null, upstream_model_id: "up/model",
                    is_active: true, capabilities: null,
                    ...(cols.includes("preferred_provider") ? { preferred_provider: "wokey" } : {}),
                  },
                  error: null,
                };
              },
            }),
          };
        },
      }),
    }),
  }),
}));

const { lookupModelRouting } = await import("../model-routing.ts");
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc" } as never;

describe("lookupModelRouting survives a missing migration", () => {
  it("serves the model when preferred_provider does not exist yet", async () => {
    // The regression this guards: selecting a column added by migration
    // 20260825000002 on the one function EVERY route calls. Deploy the Worker
    // first and every model on every modality reported "not found".
    calls.length = 0; missingColumn = true; totallyBroken = false;
    const r = await lookupModelRouting(env, "anthropic/claude-sonnet-4.6");
    expect(r).not.toBeNull();
    expect(r!.upstream_model_id).toBe("up/model");
    expect(r!.preferred_provider).toBeNull(); // absent = no preference = OpenRouter
    expect(calls.length).toBe(2); // tried with, retried without
  });

  it("uses one query when the column is there", async () => {
    calls.length = 0; missingColumn = false; totallyBroken = false;
    const r = await lookupModelRouting(env, "anthropic/claude-sonnet-4.6");
    expect(r!.preferred_provider).toBe("wokey");
    expect(calls.length).toBe(1);
  });

  it("gives up when the catalog is genuinely unreadable", async () => {
    calls.length = 0; missingColumn = false; totallyBroken = true;
    expect(await lookupModelRouting(env, "m")).toBeNull();
  });
});
