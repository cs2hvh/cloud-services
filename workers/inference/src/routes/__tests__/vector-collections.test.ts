import { describe, it, expect } from "vitest";
import { querySchema, upsertSchema, bulkDeleteRowsSchema } from "../vector-collections.ts";

// Doc: Phase-0 API-completeness review (2026-07-17). Same validation
// contract as the dashboard-only vector routes (kept in sync by hand, see
// vector-collections.ts header for the parts NOT ported: collection
// create/delete, ingest-url, ingest-file).

describe("querySchema", () => {
  it("requires either embedding or text", () => {
    expect(querySchema.safeParse({}).success).toBe(false);
    expect(querySchema.safeParse({ text: "find refund policy" }).success).toBe(true);
    expect(querySchema.safeParse({ embedding: [0.1, 0.2] }).success).toBe(true);
  });

  it("defaults top_k=10 and min_similarity=0", () => {
    const r = querySchema.safeParse({ text: "x" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.top_k).toBe(10);
      expect(r.data.min_similarity).toBe(0);
    }
  });

  it("rejects top_k out of [1, 100]", () => {
    expect(querySchema.safeParse({ text: "x", top_k: 0 }).success).toBe(false);
    expect(querySchema.safeParse({ text: "x", top_k: 101 }).success).toBe(false);
  });

  it("accepts an optional metadata filter", () => {
    const r = querySchema.safeParse({ text: "x", filter: { tenant: "acme" } });
    expect(r.success).toBe(true);
  });
});

describe("upsertSchema", () => {
  it("requires at least one row, at most 100", () => {
    expect(upsertSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(upsertSchema.safeParse({ rows: [{ external_id: "a" }] }).success).toBe(true);
    expect(upsertSchema.safeParse({ rows: Array.from({ length: 101 }, (_, i) => ({ external_id: `r${i}` })) }).success).toBe(false);
  });

  it("a row needs external_id but content/embedding are optional at the schema level (checked at runtime)", () => {
    const r = upsertSchema.safeParse({ rows: [{ external_id: "row-1" }] });
    expect(r.success).toBe(true);
  });
});

describe("bulkDeleteRowsSchema", () => {
  it("requires 1-500 external_ids", () => {
    expect(bulkDeleteRowsSchema.safeParse({ external_ids: [] }).success).toBe(false);
    expect(bulkDeleteRowsSchema.safeParse({ external_ids: ["a", "b"] }).success).toBe(true);
    expect(bulkDeleteRowsSchema.safeParse({ external_ids: Array.from({ length: 501 }, (_, i) => `r${i}`) }).success).toBe(false);
  });
});
