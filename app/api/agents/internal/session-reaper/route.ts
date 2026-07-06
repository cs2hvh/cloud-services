/**
 * POST /api/agents/internal/session-reaper
 *
 * Backstop sweep for orphaned agentcore sandbox sessions — the S3 counterpart
 * to run-reaper. Every `code` tool call now writes a real
 * agentcore.sandbox_sessions row (PersistedSandboxPool, S3.2b), with an
 * `idle_deadline` set once at session start. If the
 * agent-runner process dies mid-run (crash, OOM, k8s eviction) before its
 * `dispatcher.dispose()` finally-block runs, the session row is stuck in
 * `running` forever and — for the dev DockerSandboxPool — its container may
 * keep running too. This sweep reaps such rows past `idle_deadline`:
 *   - atomically transitions provisioning/running → stopped (settle basis), and
 *   - computes (but does not charge) the would-be cost, same as the normal
 *     settle path — money-moving stays Phase-0-gated (see settle.ts).
 *
 * Known limitation (documented, not silently glossed over): this route only
 * reaps the DATABASE row. It has no way to reach into the k8s pod / Docker
 * daemon that ran the container, so a runner that crashed without calling
 * dispose() may leak a container until that node's own housekeeping (or a
 * future runner-side sweep) cleans it up. Doc 13 lists true orphan-VM cleanup
 * as a production (real microVM pool) requirement, not a dev-executor one.
 *
 * Auth: header `X-Ahura-Internal-Token` — identical trust boundary as run-reaper.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface StuckSessionRow {
  id: string;
  org_id: string;
  run_id: string | null;
  started_at: string | null;
  per_sec_cents: number;
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-ahura-internal-token");
  const expected = process.env.BATCH_PROCESSOR_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .schema("agentcore")
    .from("sandbox_sessions")
    .select("id, org_id, run_id, started_at, per_sec_cents")
    .in("state", ["provisioning", "running"])
    .lt("idle_deadline", nowIso)
    .limit(50)
    .returns<StuckSessionRow[]>();

  if (error) {
    console.error("[agent session-reaper] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  let reaped = 0;
  let errors = 0;
  const errDetails: Array<{ id: string; msg: string }> = [];

  for (const row of rows ?? []) {
    try {
      const stoppedAt = new Date().toISOString();
      // Win the transition atomically — only a still-live session matches, so a
      // concurrent reap (or a late dispose() from the runner) never double-settles.
      const { data: won } = await supabase
        .schema("agentcore")
        .from("sandbox_sessions")
        .update({ state: "stopped", stopped_at: stoppedAt })
        .eq("id", row.id)
        .in("state", ["provisioning", "running"])
        .select("id")
        .maybeSingle();
      if (!won) continue; // a concurrent sweep or the runner's own dispose() already settled it

      const seconds = row.started_at
        ? Math.max(0, (Date.parse(stoppedAt) - Date.parse(row.started_at)) / 1000)
        : 0;
      const wouldChargeCents = Math.round(Number(row.per_sec_cents) * seconds * 10_000) / 10_000;

      reaped++;
      console.log(
        JSON.stringify({
          level: "info",
          message: "agent.sandbox_session.reaped",
          orgId: row.org_id,
          runId: row.run_id,
          sessionId: row.id,
          seconds: Number(seconds.toFixed(2)),
          wouldChargeCents, // audit-visible; not charged — see settle.ts
        })
      );
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errDetails.push({ id: row.id, msg });
      console.error(`[agent session-reaper] reap failed for session ${row.id}:`, err);
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    reaped,
    errors,
    errors_detail: errDetails,
  });
}
