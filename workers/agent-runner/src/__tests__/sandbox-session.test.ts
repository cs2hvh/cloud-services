/**
 * Sandbox session persistence + settle (S3.1/S3.2b) — committed regression tests
 * for the gap found during the doc 02/11/12/13 audit: `code` tool sessions used
 * to live only in-memory, so agentcore.sandbox_sessions was never written, and
 * neither settleSandboxSession nor the session-reaper had anything to act on.
 *
 * These replace what had only been verified by one-off manual scripts during
 * the session — that verification wasn't repeatable; these tests are.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MockSandboxPool } from "../tools/sandbox/pool.js";
import { PersistedSandboxPool } from "../tools/sandbox/persisted-pool.js";
import { settleSandboxSession } from "../tools/sandbox/settle.js";

// ── Minimal fake of the one table both PersistedSandboxPool and
//    settleSandboxSession touch (agentcore.sandbox_sessions). ────────────────
type Row = Record<string, unknown>;

function makeFakeSupabase(rows: Row[] = []) {
  let idSeq = 0;
  const table = rows;

  function query() {
    let op: "select" | "update" | "insert" = "select";
    let payload: Row = {};
    const filters: Array<{ col: string; val: unknown; kind: "eq" | "in" }> = [];

    const match = () =>
      table.filter((r) =>
        filters.every((f) => (f.kind === "eq" ? r[f.col] === f.val : (f.val as unknown[]).includes(r[f.col])))
      );

    const run = (): Row[] => {
      if (op === "insert") {
        const row = { id: `sess_${++idSeq}`, ...payload };
        table.push(row);
        return [row];
      }
      const matched = match();
      if (op === "update") matched.forEach((r) => Object.assign(r, payload));
      return matched.map((r) => ({ ...r }));
    };

    const builder = {
      select: () => builder,
      insert: (p: Row) => { op = "insert"; payload = p; return builder; },
      update: (p: Row) => { op = "update"; payload = p; return builder; },
      eq: (col: string, val: unknown) => { filters.push({ col, val, kind: "eq" as const }); return builder; },
      in: (col: string, val: unknown[]) => { filters.push({ col, val, kind: "in" as const }); return builder; },
      maybeSingle: async <T>() => { const r = run(); return { data: (r[0] ?? null) as T | null, error: null }; },
      single: async <T>() => { const r = run(); return { data: (r[0] ?? null) as T | null, error: r[0] ? null : { message: "no rows" } }; },
      // Real supabase-js query builders are directly awaitable (thenable) —
      // `await ...update(...).eq(...)` with no terminal .select()/.single()
      // is a normal, common pattern elsewhere in this codebase (e.g.
      // persistStep's heartbeat update). Without this, the fake would
      // silently no-op any such call instead of actually running it.
      then<TResult1 = { data: null; error: null }>(
        onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null
      ) {
        run();
        return Promise.resolve({ data: null, error: null }).then(onfulfilled ?? undefined);
      },
    };
    return builder;
  }

  return {
    schema: () => ({ from: () => query() }),
    _table: table,
  } as unknown as SupabaseClient & { _table: Row[] };
}

describe("PersistedSandboxPool", () => {
  it("inserts exactly ONE sandbox_sessions row even across multiple code calls in a run", async () => {
    const supabase = makeFakeSupabase();
    const pool = new PersistedSandboxPool(new MockSandboxPool(), supabase, 0.06);
    const ctx = { runId: "run_1", orgId: "org_1" };

    const s1 = await pool.start(ctx);
    await s1.exec("x = 1");
    const s2 = await pool.start(ctx); // same run calling start() again (2nd code invocation)
    await s2.exec("x + 1");

    expect(supabase._table).toHaveLength(1);
    expect(supabase._table[0]).toMatchObject({ run_id: "run_1", org_id: "org_1", kind: "code", state: "running" });
  });

  // Regression (2026-07-06 scenario review): a fixed idle_deadline set only at
  // session creation is a session-age cutoff, not an idle timeout — doc 13
  // requires the latter (time since LAST activity). A run with several code
  // calls spanning longer than the idle window, with no single call hanging,
  // would otherwise get its still-live session falsely reaped mid-run.
  it("bumps idle_deadline forward on every start() reuse, not just the first insert", async () => {
    const supabase = makeFakeSupabase();
    // bumpThrottleMs: 0 — isolate the "does it bump on reuse" behavior from
    // the separate throttle behavior covered by the test below.
    const pool = new PersistedSandboxPool(new MockSandboxPool(), supabase, 0.06, 1000, 0);
    const ctx = { runId: "run_bump", orgId: "org_1" };

    await pool.start(ctx);
    const firstDeadline = supabase._table[0].idle_deadline as string;

    await new Promise((r) => setTimeout(r, 20));
    await pool.start(ctx); // 2nd code invocation in the same run
    const secondDeadline = supabase._table[0].idle_deadline as string;

    expect(Date.parse(secondDeadline)).toBeGreaterThan(Date.parse(firstDeadline));
    expect(supabase._table).toHaveLength(1); // still one row — bump, not a new insert
  });

  // Regression guard for the opposite failure mode: without a throttle, a run
  // with many quick `code` calls in a row writes to Postgres on every single
  // one for no correctness gain (idleMs is minutes-scale; the deadline only
  // needs to stay meaningfully ahead of "now", not be re-stamped every call).
  it("throttles idle_deadline bumps — a rapid second start() within the throttle window is a no-op write", async () => {
    const supabase = makeFakeSupabase();
    const pool = new PersistedSandboxPool(new MockSandboxPool(), supabase, 0.06, 15 * 60_000, 60_000);
    const ctx = { runId: "run_throttle", orgId: "org_1" };

    await pool.start(ctx);
    const firstDeadline = supabase._table[0].idle_deadline as string;

    await pool.start(ctx); // immediate 2nd invocation — well within the 60s throttle window
    const secondDeadline = supabase._table[0].idle_deadline as string;

    expect(secondDeadline).toBe(firstDeadline); // no bump — throttled
    expect(supabase._table).toHaveLength(1);
  });

  it("dispose() settles the row: state -> stopped, stopped_at set", async () => {
    const supabase = makeFakeSupabase();
    const pool = new PersistedSandboxPool(new MockSandboxPool(), supabase, 0.06);
    await pool.start({ runId: "run_2", orgId: "org_1" });

    await pool.dispose();

    expect(supabase._table[0].state).toBe("stopped");
    expect(supabase._table[0].stopped_at).toBeTruthy();
  });

  it("a run that never calls the code tool never creates a phantom session row", async () => {
    const supabase = makeFakeSupabase();
    const pool = new PersistedSandboxPool(new MockSandboxPool(), supabase, 0.06);
    // start() never called (model never invoked `code`).
    await pool.dispose();
    expect(supabase._table).toHaveLength(0);
  });

  it("row-insert failure doesn't break code execution (logged, not thrown)", async () => {
    // A supabase stub where every insert errors, typed as SupabaseClient up
    // front (no reassignment) to keep this a plain type-safe fake.
    const erroringSupabase = {
      schema: () => ({
        from: () => ({
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "boom" } }) }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    const pool = new PersistedSandboxPool(new MockSandboxPool(), erroringSupabase, 0.06);

    const session = await pool.start({ runId: "run_3", orgId: "org_1" });
    const r = await session.exec("1+1");
    expect(r.exit_code).toBe(0); // code still ran despite the row-insert failure
  });
});

describe("settleSandboxSession", () => {
  it("computes the elapsed-time charge and transitions the row to stopped", async () => {
    const startedAt = new Date(Date.now() - 5_000).toISOString(); // 5s ago
    const supabase = makeFakeSupabase([
      { id: "sess_1", state: "running", started_at: startedAt, per_sec_cents: 0.06 },
    ]);

    const result = await settleSandboxSession(supabase, "sess_1");

    expect(result.settled).toBe(true);
    expect(result.seconds).toBeGreaterThanOrEqual(4.5);
    expect(result.wouldChargeCents).toBeCloseTo(0.06 * result.seconds, 2);
    expect(supabase._table[0].state).toBe("stopped");
  });

  it("is idempotent: a second settle on an already-stopped session does nothing", async () => {
    const supabase = makeFakeSupabase([
      { id: "sess_2", state: "running", started_at: new Date().toISOString(), per_sec_cents: 0.06 },
    ]);

    const first = await settleSandboxSession(supabase, "sess_2");
    const second = await settleSandboxSession(supabase, "sess_2");

    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false); // already stopped — no double-charge
    expect(second.wouldChargeCents).toBe(0);
  });

  it("returns settled:false for an unknown session id", async () => {
    const supabase = makeFakeSupabase([]);
    const result = await settleSandboxSession(supabase, "does_not_exist");
    expect(result.settled).toBe(false);
  });
});
