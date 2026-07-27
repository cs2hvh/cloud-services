/**
 * POST /api/inference/internal/connector-scheduler
 *
 * Cron-only sweep: make every scheduled connector whose next_sync_at has passed
 * (or was never set — a freshly-created scheduled connector) eligible by
 * flipping it to 'queued'. The data-runner's own claimer does the atomic
 * queued→syncing transition; this just makes them claimable. Manual-schedule
 * connectors are never touched here (only "sync now" queues those).
 *
 * Auth: header X-Ahura-Internal-Token — same trust boundary as the other
 * internal sweeps (serving-pod-watchdog, session-reaper).
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C2).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-ahura-internal-token");
  const expected = process.env.BATCH_PROCESSOR_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  // Due = scheduled (non-manual), currently idle/error, and either never
  // scheduled yet (next_sync_at NULL → run ASAP once) or past its due time.
  //
  // Done as TWO disjoint plain-filter updates rather than one .or(): supabase-js
  // misparses a timestamp value inside an UPDATE .or() as a column reference
  // ("column next_sync_at does not exist"), found live (C4 testing). A row's
  // next_sync_at is either NULL or a value, never both, so the two updates
  // never overlap and the counts simply sum.
  const base = () =>
    supabase
      .schema("inference")
      .from("connectors")
      .update({ status: "queued" })
      .in("status", ["idle", "error"])
      .neq("sync_schedule", "manual");

  const neverSynced = await base().is("next_sync_at", null).select("id").returns<Array<{ id: string }>>();
  const pastDue = await base().lte("next_sync_at", nowIso).select("id").returns<Array<{ id: string }>>();

  if (neverSynced.error || pastDue.error) {
    console.error("[connector-scheduler] scan failed:", neverSynced.error ?? pastDue.error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
  return NextResponse.json({ enqueued: (neverSynced.data?.length ?? 0) + (pastDue.data?.length ?? 0) });
}
