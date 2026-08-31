import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";
import type { SeedCandidate } from "@admin/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * Applies one service group of archive-derived seed candidates, each row
 * through billing.set_price() — direct table writes are revoked, and going
 * through the panel is the point: the audit trail starts at row one.
 *
 * The candidates come from billing.price_seed_candidates(), which contains
 * no arithmetic — every amount is applied in the unit it was archived in.
 * This route adds none either.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  let serviceType: string;
  try {
    const body = await request.json();
    serviceType = String(body.serviceType ?? "").trim();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!serviceType) {
    return NextResponse.json(
      { success: false, error: "serviceType is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceClient();
    const billing = supabase.schema("billing");

    const [{ data: candidates, error: candErr }, { data: liveRows, error: liveErr }] =
      await Promise.all([
        billing.rpc("price_seed_candidates"),
        billing
          .from("service_pricing")
          .select("plan_key")
          .eq("service_type", serviceType)
          .is("effective_to", null),
      ]);

    if (candErr || liveErr) {
      const msg = candErr?.message ?? liveErr?.message ?? "unknown";
      console.error("[Admin Pricing] seed reads failed:", msg);
      return NextResponse.json(
        { success: false, error: "Failed to read seed candidates" },
        { status: 500 },
      );
    }

    const alreadyPriced = new Set((liveRows ?? []).map((r) => r.plan_key));
    const group = ((candidates ?? []) as SeedCandidate[]).filter(
      (c) => c.service_type === serviceType,
    );

    const applied: string[] = [];
    const skipped: string[] = [];
    const failures: Array<{ planKey: string; error: string }> = [];

    for (const c of group) {
      if (alreadyPriced.has(c.plan_key)) {
        skipped.push(c.plan_key);
        continue;
      }

      const note = `archive seed — ${c.source}${c.review_flag ? `; ${c.review_flag}` : ""}`;
      const { data: result, error: rpcError } = await billing.rpc("set_price", {
        p_service_type: c.service_type,
        p_plan_key: c.plan_key,
        p_rate_model: c.rate_model,
        p_amount: c.amount,
        p_unit: c.unit,
        p_floor: 0,
        p_note: note.slice(0, 500),
        p_actor: admin.userId,
      });

      const outcome = result as { success?: boolean; error?: string; pricingId?: string } | null;
      if (rpcError || !outcome?.success) {
        failures.push({
          planKey: c.plan_key,
          error: rpcError?.message ?? outcome?.error ?? "refused",
        });
        continue;
      }

      applied.push(c.plan_key);
      await AuditLogService.create({
        user_id: admin.userId,
        user_role: "admin",
        user_email: admin.email,
        action: "create",
        service_type: "pricing",
        service_id: `${c.service_type}:${c.plan_key}`,
        service_name: c.plan_name,
        after_state: {
          rate_model: c.rate_model,
          unit: c.unit,
          amount: c.amount,
          pricing_id: outcome.pricingId,
          seed_source: c.source,
          review_flag: c.review_flag,
        },
        metadata: { via: "admin-panel-seed" },
      });
    }

    return NextResponse.json({
      success: failures.length === 0,
      applied: applied.length,
      skipped: skipped.length,
      failures,
    });
  } catch (err) {
    console.error("[Admin Pricing] seed unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
