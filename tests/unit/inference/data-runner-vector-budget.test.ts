import { describe, expect, it } from "vitest";
import { makeVectorBudget } from "@/workers/data-runner/src/lifecycle";

// Connector sync is the one path that writes vector_rows at bucket scale, and
// it shipped without the per-org cap every other write path enforces (upsert,
// ingest-url, ingest-file, the gateway upsert) — doc 20 §9 claims the guard
// exists. These cover the cap edges; the under-cap path is exercised live by
// every real sync.
const CAP = 1_000_000;

describe("makeVectorBudget — per-org vector cap", () => {
  it("allows a document that fits under the cap", () => {
    const budget = makeVectorBudget(0);
    expect(() => budget.take(500)).not.toThrow();
  });

  it("allows a reservation that lands exactly on the cap", () => {
    const budget = makeVectorBudget(CAP - 10);
    expect(() => budget.take(10)).not.toThrow();
  });

  it("rejects the reservation that would cross the cap", () => {
    const budget = makeVectorBudget(CAP - 10);
    expect(() => budget.take(11)).toThrow(/Vector storage limit reached/);
  });

  it("accumulates across documents within one sync", () => {
    const budget = makeVectorBudget(CAP - 100);
    budget.take(60);
    budget.take(30);
    // 90 of the remaining 100 are spoken for; 11 more must not fit.
    expect(() => budget.take(11)).toThrow(/Vector storage limit reached/);
  });

  it("rejects immediately when the org is already at the cap", () => {
    const budget = makeVectorBudget(CAP);
    expect(() => budget.take(1)).toThrow(/Vector storage limit reached/);
  });

  it("raises an error the sync treats as fatal, not a per-document failure", () => {
    const budget = makeVectorBudget(CAP);
    try {
      budget.take(1);
      throw new Error("expected the budget to reject");
    } catch (err) {
      // isFatalForSync duck-types on this flag to abort the whole sync rather
      // than mark one document failed and keep listing.
      expect((err as { isQuotaExceeded?: boolean }).isQuotaExceeded).toBe(true);
      expect((err as Error).message).not.toMatch(/openrouter|runpod|supabase/i);
    }
  });
});
