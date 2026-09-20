/**
 * One refused row must not take the batch with it.
 *
 * 2026-09-18 to 09-20: usage.provider was NOT NULL, hosted-pod events carry
 * provider null, the batch insert was refused, and Cloudflare dropped every
 * event in the batch after three retries. Two days of hosted-pod usage and
 * an unknown share of partner usage were never written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageEvent } from "../types.ts";

const state = vi.hoisted(() => ({
  batchInsertError: null as null | { message: string },
  refuseRequestIds: new Set<string>(),
  singleInserts: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    schema: () => ({
      from: (table: string) => ({
        select: () => ({
          // `.in()` is awaited directly for models and chained with
          // `.returns()` for orgs; serve both shapes.
          in: () => {
            const result =
              table === "models"
                ? {
                    data: [
                      {
                        model_id: "m",
                        pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 100 },
                        upstream_pricing: null,
                        provider_pricing: null,
                        off_peak: null,
                      },
                    ],
                    error: null,
                  }
                : { data: [], error: null };
            const p = Promise.resolve(result);
            return Object.assign(p, { returns: () => p });
          },
        }),
        insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          if (table !== "usage") return { error: null };
          if (Array.isArray(rows)) return { error: state.batchInsertError };
          const id = String(rows.request_id);
          state.singleInserts.push(id);
          return { error: state.refuseRequestIds.has(id) ? { message: `refused ${id}` } : null };
        },
      }),
    }),
  }),
}));

import { handleUsageBatch } from "./usage.ts";

function event(requestId: string): UsageEvent {
  return {
    orgId: "org",
    apiKeyId: "key",
    userId: null,
    modelId: "m",
    modality: "chat",
    requestId,
    billedTo: "platform",
    inputTokens: 1000,
    outputTokens: 1000,
    cachedTokens: 0,
    numUnits: null,
    unitLabel: null,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: 1,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    upstreamProvider: null,
    occurredAt: "2026-09-20T10:00:00.000Z",
  };
}

function makeBatch(ids: string[]) {
  const messages = ids.map((id) => ({
    id,
    timestamp: new Date(),
    attempts: 1,
    body: event(id),
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  const batch = {
    queue: "ahura-inference-usage",
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
  return { batch: batch as unknown as MessageBatch<UsageEvent>, messages, ackAll: batch.ackAll, retryAll: batch.retryAll };
}

const kv = new Map<string, string>();
const env = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "k",
  SPEND: {
    get: async (k: string) => kv.get(k) ?? null,
    put: async (k: string, v: string) => void kv.set(k, v),
  },
} as unknown as Parameters<typeof handleUsageBatch>[1];

beforeEach(() => {
  state.batchInsertError = null;
  state.refuseRequestIds = new Set();
  state.singleInserts = [];
  kv.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("handleUsageBatch when the table refuses a row", () => {
  it("acks the whole batch in one go when the batch insert succeeds", async () => {
    const { batch, messages, ackAll } = makeBatch(["a", "b"]);
    await handleUsageBatch(batch, env);
    expect(ackAll).toHaveBeenCalledTimes(1);
    expect(state.singleInserts).toEqual([]);
    for (const m of messages) expect(m.ack).not.toHaveBeenCalled();
  });

  it("retries only the refused event and keeps the rest", async () => {
    state.batchInsertError = { message: "null value in column provider" };
    state.refuseRequestIds = new Set(["b"]);
    const { batch, messages, ackAll, retryAll } = makeBatch(["a", "b", "c"]);
    await handleUsageBatch(batch, env);

    expect(state.singleInserts).toEqual(["a", "b", "c"]);
    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(messages[1]!.retry).toHaveBeenCalledTimes(1);
    expect(messages[1]!.ack).not.toHaveBeenCalled();
    expect(messages[2]!.ack).toHaveBeenCalledTimes(1);
    expect(ackAll).not.toHaveBeenCalled();
    expect(retryAll).not.toHaveBeenCalled();
  });

  it("counts spend only for the rows that were written", async () => {
    state.batchInsertError = { message: "refused" };
    state.refuseRequestIds = new Set(["b"]);
    const { batch } = makeBatch(["a", "b", "c"]);
    await handleUsageBatch(batch, env);
    const month = new Date().toISOString().slice(0, 7);
    // 1000 in + 1000 out at 100 c/Mtok each = 0.2 c, rounded up to 1 c per row.
    expect(kv.get(`org:org:month:${month}`)).toBe("2");
  });

  it("retries everything individually when every row is refused, and acks nothing", async () => {
    state.batchInsertError = { message: "refused" };
    state.refuseRequestIds = new Set(["a", "b"]);
    const { batch, messages, ackAll } = makeBatch(["a", "b"]);
    await handleUsageBatch(batch, env);
    for (const m of messages) {
      expect(m.retry).toHaveBeenCalledTimes(1);
      expect(m.ack).not.toHaveBeenCalled();
    }
    expect(ackAll).not.toHaveBeenCalled();
  });
});
