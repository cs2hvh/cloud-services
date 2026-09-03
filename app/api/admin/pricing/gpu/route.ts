// GET  /api/admin/pricing/gpu  — list all gpu_pricing rows joined with gpu name
// PUT  /api/admin/pricing/gpu  — update markup_pct + floor_per_hour_usd for one row

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient, createWorkerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createWorkerClient();
  const { data, error } = await supabase
    .from("gpu_pricing")
    .select("gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd, gpu_catalog(name, display_name)")
    .order("gpu_catalog_id")
    .order("cloud_type")
    .order("interruptible");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

/**
 * Writes go through billing.set_gpu_markup, never straight at the table.
 *
 * This route used to `.update()` gpu_pricing directly. That skipped every
 * guard the function exists to apply:
 *
 *   - the below-cost rule, which set_gpu_markup deliberately keeps in the
 *     DATABASE rather than in a route, precisely so a third caller cannot opt
 *     out of it by writing somewhere else — which is what this route was
 *   - the zero-rows-matched check: a typo'd gpu_catalog_id updated nothing and
 *     this route returned { ok: true }, so an operator believed a price had
 *     changed when it had not
 *   - the DRIFT REPORT, which compares the quote-side markup against the
 *     charge-side row in billing.service_pricing
 *
 * That last one is why this matters. On 2026-09-02 the gpu_pod charge markup
 * was moved from 1.00x to 10.00x while gpu_pricing stayed at 1.000 — a pod
 * would have been quoted at cost and billed at ten times it. The detector
 * built to catch exactly that divergence never ran, because the write went
 * through here instead of through the function that reports it.
 *
 * Amount validation below is type sanitation only. The business rules
 * (markup >= 1, floor >= 0) belong to the function and its messages are
 * returned verbatim.
 */
export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd, note } = body;

  if (!gpu_catalog_id || !cloud_type || typeof interruptible !== "boolean") {
    return NextResponse.json({ error: "gpu_catalog_id, cloud_type, interruptible are required" }, { status: 400 });
  }

  const markup = Number(markup_pct);
  const floor = Number(floor_per_hour_usd);
  // NaN and Infinity are rejected HERE because Postgres orders NaN above every
  // other numeric, so `p_markup_pct < 1` would not catch it — a NaN markup
  // would sail past the function's below-cost guard.
  if (!Number.isFinite(markup)) {
    return NextResponse.json({ error: "markup_pct must be a number (e.g. 1.25 = 25% markup)" }, { status: 400 });
  }
  if (!Number.isFinite(floor)) {
    return NextResponse.json({ error: "floor_per_hour_usd must be a number" }, { status: 400 });
  }

  // createServiceClient, not createWorkerClient: the worker client is typed
  // against the generated Database, whose RPC map does not carry billing-schema
  // functions, so the call would be typed `never`. Same service-role key — this
  // is the client every other billing RPC in the codebase uses.
  const supabase = await createServiceClient();
  const { data, error } = await supabase.schema("billing").rpc("set_gpu_markup", {
    p_gpu_catalog_id: gpu_catalog_id,
    p_cloud_type: cloud_type,
    p_interruptible: interruptible,
    p_markup_pct: markup,
    p_floor_per_hour: floor,
    p_note: typeof note === "string" && note.trim() ? note.trim() : null,
    p_actor: adminCheck.userId ?? null,
    // Always a targeted edit: the three identifying columns are required above,
    // so this can never be the unfiltered blanket case the flag guards.
    p_blanket: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? {}) as {
    success?: boolean;
    error?: string;
    rowsUpdated?: number;
    drift?: Record<string, unknown>;
  };

  // A refusal is a 400, not a silent success. The function reports "no pricing
  // rows matched those filters" as a failure for the same reason.
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Price update refused" }, { status: 400 });
  }

  // `drift` is the whole point of routing through the function: it says whether
  // the quote markup now agrees with what gpu_pod is actually charged.
  return NextResponse.json({
    ok: true,
    rowsUpdated: result.rowsUpdated,
    drift: result.drift,
  });
}
