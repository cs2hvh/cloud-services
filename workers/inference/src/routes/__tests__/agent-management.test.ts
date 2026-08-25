import { describe, it, expect } from "vitest";
import {
  createAgentSchema, updateAgentSchema, createAgentKeySchema, rotateAgentKeySchema, rotatedKeyExpiry,
} from "../agent-management.ts";

// Doc: Phase-0 API-completeness review (2026-07-17) — the agent-CRUD/key
// surface existed only behind a dashboard session before this file. Same
// validation contract as lib/agentcore/agent-schema.ts + the dashboard's
// agent-keys routes (kept in sync by hand, see agent-management.ts header).

describe("createAgentSchema", () => {
  it("accepts a minimal valid agent", () => {
    expect(createAgentSchema.safeParse({ name: "Research", model: "openai/gpt-4o" }).success).toBe(true);
  });

  it("rejects a missing name/model", () => {
    expect(createAgentSchema.safeParse({ model: "m" }).success).toBe(false);
    expect(createAgentSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("accepts an agent-delegate tool decl (loose passthrough — server enforces the real shape)", () => {
    const r = createAgentSchema.safeParse({
      name: "Coordinator",
      model: "openai/gpt-4o",
      tools: [{ type: "agent", target_agent_id: "11111111-1111-1111-1111-111111111111", label: "research" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects out-of-range max_steps / non-positive max_cost_cents", () => {
    expect(createAgentSchema.safeParse({ name: "x", model: "m", max_steps: 101 }).success).toBe(false);
    expect(createAgentSchema.safeParse({ name: "x", model: "m", max_cost_cents: 0 }).success).toBe(false);
  });
});

describe("updateAgentSchema", () => {
  it("accepts a partial patch", () => {
    expect(updateAgentSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateAgentSchema.safeParse({ max_cost_cents: 250 }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(updateAgentSchema.safeParse({}).success).toBe(false);
  });
});

describe("createAgentKeySchema", () => {
  it("defaults to private tier, no origin required", () => {
    const r = createAgentKeySchema.safeParse({ name: "server key" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tier).toBe("private");
  });

  it("requires at least one allowed_origins entry for a public key", () => {
    expect(createAgentKeySchema.safeParse({ name: "widget", tier: "public" }).success).toBe(false);
    expect(
      createAgentKeySchema.safeParse({ name: "widget", tier: "public", allowed_origins: ["https://example.com"] }).success
    ).toBe(true);
  });

  it("rejects a non-https, non-localhost origin", () => {
    const r = createAgentKeySchema.safeParse({
      name: "widget", tier: "public", allowed_origins: ["http://example.com"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts http://localhost for testing", () => {
    const r = createAgentKeySchema.safeParse({
      name: "widget", tier: "public", allowed_origins: ["http://localhost:3000"],
    });
    expect(r.success).toBe(true);
  });
});

describe("rotateAgentKeySchema", () => {
  it("grace_hours is optional and bounded to [0, 168]", () => {
    expect(rotateAgentKeySchema.safeParse({}).success).toBe(true);
    expect(rotateAgentKeySchema.safeParse({ grace_hours: 0 }).success).toBe(true);
    expect(rotateAgentKeySchema.safeParse({ grace_hours: 168 }).success).toBe(true);
    expect(rotateAgentKeySchema.safeParse({ grace_hours: 169 }).success).toBe(false);
    expect(rotateAgentKeySchema.safeParse({ grace_hours: -1 }).success).toBe(false);
  });
});

// Mirrors app/api/agents/[id]/keys/[keyId]/rotate/route.ts's inline logic —
// rotating a key must never LOOSEN an expiry the customer already set.
describe("rotatedKeyExpiry", () => {
  const now = new Date("2026-07-17T00:00:00Z");

  it("uses the grace deadline when the key had no prior expiry", () => {
    const result = rotatedKeyExpiry(now, 24, null);
    expect(result.toISOString()).toBe("2026-07-18T00:00:00.000Z");
  });

  it("keeps the tighter EXISTING expiry when it falls before the grace deadline", () => {
    const result = rotatedKeyExpiry(now, 24, "2026-07-17T06:00:00Z");
    expect(result.toISOString()).toBe("2026-07-17T06:00:00.000Z");
  });

  it("uses the grace deadline when the existing expiry is further out than it", () => {
    const result = rotatedKeyExpiry(now, 24, "2026-08-01T00:00:00Z");
    expect(result.toISOString()).toBe("2026-07-18T00:00:00.000Z");
  });

  it("grace_hours=0 means immediate expiry (explicit 'kill it now')", () => {
    const result = rotatedKeyExpiry(now, 0, null);
    expect(result.toISOString()).toBe(now.toISOString());
  });
});
