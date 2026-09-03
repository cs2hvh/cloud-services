/**
 * POST /api/inference/internal/deployment-meter
 *
 * Scheduled sweep that bills BYO model deployments for GPU worker uptime.
 * RunPod Serverless charges us per worker-second (always-on min_workers AND
 * execution); without this, deployments are free to the customer.
 *
 * For each active deployment with an endpoint, sample the live worker count
 * (v2 health) and charge the interval since the last sample × the resale GPU
 * rate. The meter advances `last_metered_at` on every billed or idle tick, so
 * a missed tick never double-charges and the first tick only seeds the clock.
 * It does NOT advance past time it could not bill — unknown worker count, no
 * GPU rate for the SKU, no org payer, or an inventory load failure — so that
 * time stays owed instead of being silently written off.
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` — same trust
 * boundary as the serving-pod / finetune watchdogs. Scheduled by the CF cron
 * worker every 5 min.
 *
 * Returns: { scanned, charged, charged_usd, skipped, errors, unpriced, no_payer }.
 * `unpriced` / `no_payer` are deployments with owed time the tick could not
 * bill (clock not advanced). An inventory load failure skips the whole tick
 * and reports `errors: 1` with an `error` message.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { RunPodService } from "@/lib/services/runpod-service";
import { getServerlessWorkerCount } from "@/lib/inference/deploy-runpod";
import { meterDeployment, type DeploymentMeterRow } from "@/lib/inference/deployment-billing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Same resale markup the deploy picker + GPU-pod billing apply to the raw
// observed RunPod rate.
const GPU_RESALE_MARKUP = 1.25;

// Cap the interval a single tick can bill so a stalled cron / clock skew can't
// emit one huge catch-up charge. Normal tick is ~5 min.
const MAX_INTERVAL_SECONDS = Number(process.env.DEPLOY_METER_MAX_INTERVAL_SEC ?? 3600);

// Per-tick scan cap. Rows are ordered longest-unmetered first so hitting the
// cap delays the freshest clocks, never the same starved ones every tick.
const SCAN_LIMIT = 200;

// Legacy short SKU → verbatim RunPod gpuTypeId, so older deployment rows can
// still resolve a rate from the live inventory.
const LEGACY_SKU_TO_RUNPOD: Record<string, string> = {
  A40: "NVIDIA A40",
  L40S: "NVIDIA L40S",
  "RTX-6000-Ada": "NVIDIA RTX 6000 Ada Generation",
  "A100-40GB": "NVIDIA A100-PCIE-40GB",
  "A100-80GB": "NVIDIA A100 80GB PCIe",
  "H100-80GB": "NVIDIA H100 80GB HBM3",
};

interface DeploymentRow extends DeploymentMeterRow {
  gpu_sku: string;
  runpod_endpoint_id: string | null;
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

  // Deployments that can have workers up right now.
  const { data: rows, error } = await supabase
    .schema("inference")
    .from("deployments")
    .select("id, org_id, name, gpu_sku, runpod_endpoint_id, last_metered_at")
    .in("status", ["active", "deploying", "paused"])
    .not("runpod_endpoint_id", "is", null)
    // Longest-unmetered first (never-metered rows before all), so a capped
    // scan starves the freshest clocks rather than the same stale ones.
    .order("last_metered_at", { ascending: true, nullsFirst: true })
    .limit(SCAN_LIMIT)
    .returns<DeploymentRow[]>();

  if (error) {
    console.error("[deploy-meter] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
  const scanned = rows?.length ?? 0;
  if (scanned >= SCAN_LIMIT) {
    console.warn(
      `[deploy-meter] scan cap hit (${SCAN_LIMIT}); remaining deployments wait for the next tick`
    );
  }

  // Build runpod_gpu_id → resale-per-worker-hour (cents) from the live catalog.
  const rateByGpu = new Map<string, number>();
  let inventoryError: string | null = null;
  try {
    const inv = await RunPodService.listLatest();
    if (inv.success && inv.data) {
      for (const r of inv.data) {
        if (r.cloudType !== "SECURE" || r.onDemandPerHr === null) continue;
        rateByGpu.set(r.runpodGpuId, Math.round(r.onDemandPerHr * GPU_RESALE_MARKUP * 100));
      }
    } else {
      // listLatest() catches internally and returns success:false, so this —
      // not the catch below — is the path a DB/read failure actually takes.
      inventoryError = inv.error ?? "inventory unavailable";
    }
  } catch (e) {
    inventoryError = e instanceof Error ? e.message : String(e);
  }
  if (inventoryError !== null) {
    // Without rates every deployment would meter at $0 and advance its clock,
    // writing off GPU time RunPod still bills us for. Skip the whole tick and
    // touch nothing; the next tick bills the (capped) interval. Reported as an
    // error, not as a clean `errors: 0` tick.
    console.error(
      `[deploy-meter] inventory rate load failed (${inventoryError}); skipping tick, ${scanned} deployment(s) left unmetered`
    );
    return NextResponse.json({
      scanned,
      charged: 0,
      charged_usd: 0,
      skipped: scanned,
      errors: 1,
      unpriced: 0,
      no_payer: 0,
      error: "Inventory rate load failed; tick skipped, no clocks advanced",
    });
  }

  const nowMs = Date.now();
  let charged = 0;
  let chargedUsd = 0;
  let skipped = 0;
  let errors = 0;
  let unpriced = 0;
  let noPayer = 0;

  for (const row of rows ?? []) {
    if (!row.runpod_endpoint_id) continue;
    try {
      const workersUp = await getServerlessWorkerCount(row.runpod_endpoint_id);
      // Unknown worker count → bill nothing this tick (never guess). Don't even
      // advance the clock, so the next tick can bill the whole interval once the
      // health endpoint is reachable again.
      if (workersUp === null) {
        skipped++;
        continue;
      }
      // null (not 0) when the SKU has no inventory rate: a 0 here used to read
      // as "nothing billable" and advance the clock past unbilled GPU time.
      const rateCents =
        rateByGpu.get(row.gpu_sku) ??
        rateByGpu.get(LEGACY_SKU_TO_RUNPOD[row.gpu_sku] ?? "") ??
        null;
      const res = await meterDeployment(
        supabase,
        row,
        workersUp,
        rateCents,
        nowMs,
        MAX_INTERVAL_SECONDS
      );
      switch (res.outcome) {
        case "charged":
          charged++;
          chargedUsd += res.chargedUsd;
          break;
        case "unpriced":
          unpriced++;
          break;
        case "no_payer":
          noPayer++;
          break;
        case "charge_failed":
          errors++;
          break;
      }
    } catch (e) {
      errors++;
      console.error(`[deploy-meter] meter failed for deployment ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    scanned,
    charged,
    charged_usd: Number(chargedUsd.toFixed(4)),
    skipped,
    errors,
    unpriced,
    no_payer: noPayer,
  });
}
