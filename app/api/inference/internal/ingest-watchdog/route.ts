/**
 * POST /api/inference/internal/ingest-watchdog
 *
 * Cron-only backstop for connector syncs whose runner died mid-flight (crash,
 * OOM, k8s eviction) — the connector is stuck 'syncing' forever otherwise.
 * Reaps any 'syncing' connector whose heartbeat_at is stale (the data-runner
 * touches it every ~15s while a sync is alive), flipping it to 'error' with a
 * clear message and next_sync_at=now so a *scheduled* connector re-queues on
 * the next scheduler tick (manual ones wait for the user to re-sync).
 *
 * Auth: header X-Ahura-Internal-Token (mirrors serving-pod-watchdog).
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§6, §12, Slice C2).
 */
import { NextRequest, NextResponse } from "next/server";
import { withCronRun } from "@/lib/inference/cron-heartbeat";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A live sync heartbeats every ~15s; 10 min stale = the runner is gone.
const STALE_MS = 10 * 60_000;

async function sweep(request: NextRequest) {
  const token = request.headers.get("x-ahura-internal-token");
  const expected = process.env.BATCH_PROCESSOR_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await supabase
    .schema("inference")
    .from("connectors")
    .update({
      status: "error",
      claimed_by: null,
      heartbeat_at: null,
      last_error: "Sync was interrupted (runner restart) — it will retry automatically.",
      next_sync_at: new Date().toISOString(),
    })
    .eq("status", "syncing")
    .lt("heartbeat_at", staleBefore)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    console.error("[ingest-watchdog] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
  return NextResponse.json({ reaped: data?.length ?? 0 });
}

// Heartbeat wrapper. Without it this sweep's only trace is a Cloudflare log line,
// which no admin page can read — see lib/inference/cron-heartbeat.ts.
export async function POST(request: NextRequest) {
  return withCronRun("ingest-watchdog", () => sweep(request));
}
