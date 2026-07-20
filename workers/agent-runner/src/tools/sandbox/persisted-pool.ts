/**
 * PersistedSandboxPool (S3.1/S3.2) — wraps any SandboxPool with real DB session
 * tracking. Closes the gap doc 13's "Code seams" table requires but was never
 * built: every sandbox session used to live ONLY in the pool's in-memory session
 * object, so agentcore.sandbox_sessions (created in the S1 migration) was never
 * written to, and there was nothing for an idle reaper or a settle function to
 * find. This decorator adds exactly that, without touching the execution
 * semantics in docker-pool.ts (dev) / the future gVisor pool (prod).
 *
 * idle_deadline is bumped forward on EVERY start() call (each `code` invocation
 * within the run), not just the first — doc 13's "idle reaper" requirement means
 * time-since-LAST-activity, not time-since-session-start. A fixed deadline would
 * let the reaper falsely mark a still-live, long-running session 'stopped' mid-run
 * (found by scenario review, 2026-07-06) purely because the run's total sandbox
 * usage spans longer than the deadline window, even with no single call hanging.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SandboxPool, SandboxSession } from "./pool.js";
import { settleSandboxSession } from "./settle.js";

/** Idle window: the reaper only acts once a session has gone quiet (no start()
 *  call, i.e. no code invocation) for this long — refreshed on every use, not
 *  a fixed session-age cutoff. Generous vs. a single run's step cadence, so it
 *  never races a live, slow-but-working run. */
const IDLE_MS_DEFAULT = 15 * 60_000;

/** Bump throttle: skip the idle_deadline write if the last bump is still this
 *  fresh — a run with many quick `code` calls in a row would otherwise write
 *  to Postgres on every single one for no behavioral gain (the deadline only
 *  needs to stay meaningfully ahead of "now", not be re-stamped every call). */
const BUMP_THROTTLE_MS_DEFAULT = 60_000;

export class PersistedSandboxPool implements SandboxPool {
  private sessionRowId: string | null = null;
  private lastBumpAt = 0;

  constructor(
    private readonly inner: SandboxPool,
    private readonly supabase: SupabaseClient,
    private readonly perSecCents: number,
    private readonly idleMs: number = IDLE_MS_DEFAULT,
    private readonly bumpThrottleMs: number = BUMP_THROTTLE_MS_DEFAULT
  ) {}

  async start(ctx: { runId: string; orgId: string }): Promise<SandboxSession> {
    const session = await this.inner.start(ctx);
    // One row per run's session — insert lazily on first real use (not eagerly
    // in the constructor), so a run that never calls `code` never creates a
    // phantom session row. The inner pool already returns the same session for
    // every call within a run, so this only fires once.
    if (!this.sessionRowId) {
      const { data, error } = await this.supabase
        .schema("agentcore")
        .from("sandbox_sessions")
        .insert({
          run_id: ctx.runId,
          org_id: ctx.orgId,
          kind: "code",
          state: "running",
          per_sec_cents: this.perSecCents,
          started_at: new Date().toISOString(),
          idle_deadline: new Date(Date.now() + this.idleMs).toISOString(),
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        // A row-insert failure must not break code execution — the session
        // still runs; it just won't be reaper/settle-visible. Log, don't throw.
        console.error(`[sandbox session] row insert failed for run ${ctx.runId}: ${error.message}`);
      } else {
        this.sessionRowId = data?.id ?? null;
        this.lastBumpAt = Date.now();
      }
    } else if (Date.now() - this.lastBumpAt >= this.bumpThrottleMs) {
      // Bump idle_deadline forward on every REUSE too (throttled) — otherwise
      // this is a fixed session-age cutoff, not an idle timeout: a run with
      // several code calls spanning >idleMs total (no code call individually
      // slow, just many of them across a long-running agent loop) would have
      // its still-live session falsely reaped mid-run (doc 13's "idle reaper"
      // requirement means time-since-LAST-activity, not time-since-start).
      // Throttled to at most once per bumpThrottleMs: idleMs is minutes-scale,
      // so a write far more often than that buys no correctness, just DB load.
      // Best-effort: a failed bump must not break code execution either.
      const { error } = await this.supabase
        .schema("agentcore")
        .from("sandbox_sessions")
        .update({ idle_deadline: new Date(Date.now() + this.idleMs).toISOString() })
        .eq("id", this.sessionRowId)
        .in("state", ["provisioning", "running"]);
      if (error) {
        console.error(`[sandbox session] idle_deadline bump failed for ${this.sessionRowId}: ${error.message}`);
      } else {
        this.lastBumpAt = Date.now();
      }
    }
    return session;
  }

  async dispose(): Promise<{ cpu_seconds: number }> {
    const result = await this.inner.dispose();
    if (this.sessionRowId) {
      const id = this.sessionRowId;
      await settleSandboxSession(this.supabase, id).catch((e) =>
        console.error(`[sandbox session] settle failed for ${id}: ${e instanceof Error ? e.message : String(e)}`)
      );
    }
    return result;
  }
}
