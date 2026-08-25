import { describe, it, expect } from "vitest";
import { decide, gateFor, GATED_KEYS } from "../feature-gate.ts";

// Per-capability kill switches. The switch itself is a row in
// public.platform_settings; this is the half that makes flipping it real.
//
// The dangerous failure mode is NOT "a request slipped through" — it is gating
// something that should have stayed up, because an operator turning media off to
// stop a bleeding upstream must not also stop customers polling jobs they have
// already paid for, or cleaning up a runaway agent. Most of these assertions are
// therefore about what is NOT gated.

const gated = (method: string, path: string) => gateFor(method, path)?.key ?? null;

describe("what a switch stops", () => {
  it("gates the paid inference surface", () => {
    expect(gated("POST", "/v1/chat/completions")).toBe("ai_inference_enabled");
    expect(gated("POST", "/v1/embeddings")).toBe("ai_inference_enabled");
    expect(gated("POST", "/v1/rerank")).toBe("ai_inference_enabled");
    expect(gated("POST", "/v1/moderations")).toBe("ai_inference_enabled");
    expect(gated("POST", "/v1/messages")).toBe("ai_inference_enabled");
  });

  it("gates starting an agent run", () => {
    expect(gated("POST", "/v1/responses")).toBe("ai_agents_enabled");
    expect(gated("POST", "/v1/agents/abc-123/runs")).toBe("ai_agents_enabled");
  });

  it("gates every media generator, including the upstream re-submit", () => {
    for (const path of [
      "/v1/images/generations",
      "/v1/videos",
      "/v1/videos/abc-123/retry",
      "/v1/audio/music",
      "/v1/audio/speech",
      "/v1/audio/transcriptions",
      "/v1/ocr",
    ]) {
      expect(gated("POST", path), path).toBe("ai_media_enabled");
    }
  });

  it("gates the connector sync trigger", () => {
    expect(gated("POST", "/v1/connectors/abc-123/sync")).toBe("ai_connector_sync_enabled");
  });
});

describe("what a switch must NOT stop", () => {
  it("polling a media job the customer already paid for", () => {
    expect(gated("GET", "/v1/videos/abc-123")).toBeNull();
    expect(gated("GET", "/v1/videos/abc-123/content")).toBeNull();
  });

  it("reading, cancelling or streaming an agent run in flight", () => {
    expect(gated("GET", "/v1/agents/runs/abc-123")).toBeNull();
    expect(gated("GET", "/v1/agents/runs/abc-123/stream")).toBeNull();
    expect(gated("POST", "/v1/agents/runs/abc-123/cancel")).toBeNull();
  });

  it("agent and key management — the one thing that lets a customer fix a runaway", () => {
    expect(gated("DELETE", "/v1/agents/abc-123")).toBeNull();
    expect(gated("POST", "/v1/agents/abc-123/keys")).toBeNull();
    expect(gated("DELETE", "/v1/agents/abc-123/keys/k1")).toBeNull();
    expect(gated("PATCH", "/v1/agents/abc-123")).toBeNull();
  });

  it("catalog and key introspection", () => {
    expect(gated("GET", "/v1/models")).toBeNull();
    expect(gated("GET", "/v1/key")).toBeNull();
    expect(gated("GET", "/health")).toBeNull();
  });

  it("searching vectors that already exist — turning syncs off must not blind RAG", () => {
    expect(gated("POST", "/v1/vector/collections/abc/query")).toBeNull();
    expect(gated("POST", "/v1/vector/collections/abc/answer")).toBeNull();
    expect(gated("GET", "/v1/connectors/abc-123")).toBeNull();
    expect(gated("DELETE", "/v1/connectors/abc-123")).toBeNull();
  });
});

describe("matching is exact", () => {
  it("does not gate by prefix — an unmatched path stays served", () => {
    expect(gated("POST", "/v1/chat/completions/extra")).toBeNull();
    expect(gated("POST", "/v1/ocr/batch")).toBeNull();
    expect(gated("POST", "/v2/chat/completions")).toBeNull();
  });

  it("is method-specific", () => {
    expect(gated("GET", "/v1/chat/completions")).toBeNull();
    expect(gated("POST", "/v1/videos")).not.toBeNull();
    expect(gated("GET", "/v1/videos")).toBeNull();
  });
});

describe("never blocks a customer request", () => {
  // This, not the path matching, is the part that either holds or quietly stops
  // holding. The first version of this middleware awaited the setting with a 10s
  // isolate cache — and since Cloudflare recycles isolates constantly and this
  // platform sees ~1,700 inference requests per 30 days, almost every request
  // would have paid a Supabase round trip for a switch flipped twice a year.
  const NOW = 1_000_000;

  it("a cold isolate serves the request and learns behind it", () => {
    expect(decide(undefined, NOW)).toEqual({ enabled: true, refresh: true });
  });

  it("a fresh entry answers from memory with NO refresh — the common case does no I/O", () => {
    expect(decide({ value: true, at: NOW - 1_000 }, NOW)).toEqual({ enabled: true, refresh: false });
    expect(decide({ value: false, at: NOW - 1_000 }, NOW)).toEqual({ enabled: false, refresh: false });
  });

  it("a stale entry still answers immediately, and refreshes behind the request", () => {
    // The important half is `enabled` coming from the STALE value rather than a
    // blocking read: a switched-off capability stays off across the refresh.
    expect(decide({ value: false, at: NOW - 60_000 }, NOW)).toEqual({ enabled: false, refresh: true });
    expect(decide({ value: true, at: NOW - 60_000 }, NOW)).toEqual({ enabled: true, refresh: true });
  });

  it("honours the TTL boundary in the safe direction", () => {
    expect(decide({ value: true, at: NOW - 30_000 }, NOW, 30_000).refresh).toBe(true);
    expect(decide({ value: true, at: NOW - 29_999 }, NOW, 30_000).refresh).toBe(false);
  });

  it("an unknown state is always ENABLED — a storage wobble must not stop the platform", () => {
    expect(decide(undefined, NOW).enabled).toBe(true);
  });
});
