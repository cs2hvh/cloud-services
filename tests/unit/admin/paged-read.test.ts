import { describe, it, expect } from "vitest";
import { POSTGREST_MAX_ROWS, readAllPaged } from "@/lib/admin/paged-read";

// The bug this prevents, measured on real data 2026-08-04: the AI Usage page
// asked PostgREST for 20,000 rows over a window holding 1,572. It got 1,000, no
// error and no warning, reported `truncated: false` (its check was
// `length >= 20000`), and under-stated platform spend by 34%.

/** A fake PostgREST that enforces the same silent per-response ceiling. */
function fakeServer(totalRows: number, cap = POSTGREST_MAX_ROWS) {
  const calls: Array<{ from: number; to: number; served: number }> = [];
  const query = (from: number, to: number) => {
    const requested = to - from + 1;
    // The whole trap in one line: the server shortens the response and says
    // nothing about it.
    const served = Math.min(requested, cap, Math.max(0, totalRows - from));
    calls.push({ from, to, served });
    return Promise.resolve({
      data: Array.from({ length: served }, (_, i) => ({ id: from + i })),
      error: null,
    });
  };
  return { query, calls };
}

describe("readAllPaged", () => {
  it("reads past the 1,000-row ceiling that broke the usage page", async () => {
    const { query } = fakeServer(1_572);
    const res = await readAllPaged<{ id: number }>(query, { maxRows: 20_000 });
    expect(res.rows).toHaveLength(1_572);
    expect(res.truncated).toBe(false);
    expect(res.error).toBeNull();
  });

  it("returns every row exactly once, in order", async () => {
    const { query } = fakeServer(2_500);
    const res = await readAllPaged<{ id: number }>(query, { maxRows: 20_000 });
    expect(res.rows.map((r) => r.id)).toEqual(Array.from({ length: 2_500 }, (_, i) => i));
    expect(new Set(res.rows.map((r) => r.id)).size).toBe(2_500);
  });

  it("stops on a short page rather than looping forever", async () => {
    const { query, calls } = fakeServer(1_200);
    await readAllPaged<{ id: number }>(query, { maxRows: 20_000 });
    // 1000 + 200(short) — the short page ends it.
    expect(calls.map((c) => c.served)).toEqual([1_000, 200]);
  });

  it("an exact multiple of the page size needs one extra, empty page", async () => {
    // The off-by-one that would drop rows if termination were `< pageSize` on a
    // count rather than on the page actually served.
    const { query, calls } = fakeServer(2_000);
    const res = await readAllPaged<{ id: number }>(query, { maxRows: 20_000 });
    expect(res.rows).toHaveLength(2_000);
    expect(calls.map((c) => c.served)).toEqual([1_000, 1_000, 0]);
  });

  it("truncated is TRUE only when the caller's real bound is hit", async () => {
    const { query } = fakeServer(10_000);
    const res = await readAllPaged<{ id: number }>(query, { maxRows: 2_000 });
    expect(res.rows).toHaveLength(2_000);
    expect(res.truncated).toBe(true);
  });

  it("never asks for more than the server will serve, so a page is never silently shortened", async () => {
    const { query, calls } = fakeServer(5_000);
    await readAllPaged<{ id: number }>(query, { maxRows: 20_000, pageSize: 50_000 });
    for (const c of calls) expect(c.to - c.from + 1).toBeLessThanOrEqual(POSTGREST_MAX_ROWS);
  });

  it("never overshoots maxRows on the final page", async () => {
    const { query, calls } = fakeServer(10_000);
    const res = await readAllPaged<{ id: number }>(query, { maxRows: 1_500 });
    expect(res.rows).toHaveLength(1_500);
    expect(calls.at(-1)!.to - calls.at(-1)!.from + 1).toBe(500);
  });

  it("returns the rows read so far alongside an error, never presenting them as complete", async () => {
    let n = 0;
    const flaky = (from: number, to: number) => {
      n++;
      if (n === 2) return Promise.resolve({ data: null, error: { message: "connection reset" } });
      return Promise.resolve({
        data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })),
        error: null,
      });
    };
    const res = await readAllPaged<{ id: number }>(flaky, { maxRows: 20_000 });
    expect(res.error).toBe("connection reset");
    expect(res.rows).toHaveLength(1_000);
    // Critically NOT true — a partial read must never claim to be a clean stop.
    expect(res.truncated).toBe(false);
  });

  it("handles an empty result set without a wasted round trip", async () => {
    const { query, calls } = fakeServer(0);
    const res = await readAllPaged<{ id: number }>(query, { maxRows: 20_000 });
    expect(res.rows).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
