// GET  /api/admin/pricing/gpu  — list all gpu_pricing rows joined with gpu name
// PUT  /api/admin/pricing/gpu  — update markup_pct + floor_per_hour_usd for one row

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createWorkerClient } from "@/lib/supabase/server";

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

export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { gpu_catalog_id, cloud_type, interruptible, markup_pct, floor_per_hour_usd } = body;

  if (!gpu_catalog_id || !cloud_type || typeof interruptible !== "boolean") {
    return NextResponse.json({ error: "gpu_catalog_id, cloud_type, interruptible are required" }, { status: 400 });
  }
  const markup = Number(markup_pct);
  const floor = Number(floor_per_hour_usd);
  if (!Number.isFinite(markup) || markup < 1) {
    return NextResponse.json({ error: "markup_pct must be ≥ 1.000 (e.g. 1.25 = 25% markup)" }, { status: 400 });
  }
  if (!Number.isFinite(floor) || floor < 0) {
    return NextResponse.json({ error: "floor_per_hour_usd must be ≥ 0" }, { status: 400 });
  }

  const supabase = await createWorkerClient();
  const { error } = await supabase
    .from("gpu_pricing")
    .update({ markup_pct: markup, floor_per_hour_usd: floor })
    .eq("gpu_catalog_id", gpu_catalog_id)
    .eq("cloud_type", cloud_type)
    .eq("interruptible", interruptible);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
