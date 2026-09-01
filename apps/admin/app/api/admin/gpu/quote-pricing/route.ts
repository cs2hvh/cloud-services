import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

/**
 * QUOTE-path GPU pricing: public.gpu_pricing, per (model, cloud,
 * interruptible), read by createPod() for the customer's quote. This is NOT
 * what the customer is billed — that is billing.service_pricing
 * ('gpu_pod','*'), edited only through the price book / set_price(). The
 * panel shows both and banners on drift; this route exists so quote-path
 * edits are audited like every other price write (the main app's PUT is
 * not). Same validations as the main app's route: markup >= 1, floor >= 0.
 */
export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const gpuCatalogId = String(body.gpu_catalog_id ?? "");
  const cloudType = String(body.cloud_type ?? "");
  const interruptible = Boolean(body.interruptible);
  const markup = Number(body.markup_pct);
  const floor = Number(body.floor_per_hour_usd ?? 0);

  if (!gpuCatalogId || !cloudType) {
    return NextResponse.json({ success: false, error: "Missing row key" }, { status: 400 });
  }
  if (!Number.isFinite(markup) || markup < 1) {
    return NextResponse.json(
      { success: false, error: "markup_pct must be ≥ 1.000 (never below cost)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(floor) || floor < 0) {
    return NextResponse.json(
      { success: false, error: "floor_per_hour_usd must be ≥ 0" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceClient();
    const { data: before } = await supabase
      .from("gpu_pricing")
      .select("markup_pct, floor_per_hour_usd")
      .eq("gpu_catalog_id", gpuCatalogId)
      .eq("cloud_type", cloudType)
      .eq("interruptible", interruptible)
      .maybeSingle();

    const { error } = await supabase
      .from("gpu_pricing")
      .update({ markup_pct: markup, floor_per_hour_usd: floor })
      .eq("gpu_catalog_id", gpuCatalogId)
      .eq("cloud_type", cloudType)
      .eq("interruptible", interruptible);

    if (error) {
      console.error("[Admin GPU] quote pricing update failed:", error.message);
      return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
    }

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "update",
      service_type: "pricing",
      service_id: `gpu_quote:${gpuCatalogId}:${cloudType}:${interruptible}`,
      service_name: `GPU quote pricing ${gpuCatalogId}`,
      before_state: before ?? undefined,
      after_state: { markup_pct: markup, floor_per_hour_usd: floor },
      metadata: {
        via: "admin-panel",
        note: "QUOTE path (public.gpu_pricing) — charge path is billing.service_pricing gpu_pod/*",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin GPU] quote pricing unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
