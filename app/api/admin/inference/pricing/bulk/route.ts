// POST /api/admin/inference/pricing/bulk — reprice many models to a target margin.
//
// Editing 20 underwater models one field at a time is how they got underwater in
// the first place, so this applies a rule instead: price = cost / (1 - margin).
//
// DRY-RUN BY DEFAULT (same discipline as scripts/sync-or-model-pricing.ts). The
// preview and the real run share one planner — planReprice() in
// lib/admin/inference-pricing.ts — so what you approve is exactly what is written.
//
// Doc: nextstespsAI/21-admin-platform.md (§4, section A1).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { planReprice, type ModelPricingRow } from "@/lib/admin/inference-pricing";
import { inferenceAdminClient, MODEL_COLUMNS } from "@/lib/admin/inference-client";
import { actorContext, bulkRepriceEntry, recordAdminAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const targetMarginPct = Number(body?.margin_pct);
  if (!Number.isFinite(targetMarginPct) || targetMarginPct < 0 || targetMarginPct >= 100) {
    return NextResponse.json({ error: "margin_pct must be a number in [0, 100)" }, { status: 400 });
  }

  const supabase = inferenceAdminClient();
  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .select(MODEL_COLUMNS)
    .eq("is_active", true)
    .returns<ModelPricingRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const plan = planReprice(data ?? [], {
    targetMarginPct,
    onlyUnderwater: body?.only_at_or_below_cost !== false,
    modelIds: Array.isArray(body?.model_ids) ? body.model_ids : null,
  });

  if (body?.apply !== true) {
    return NextResponse.json({
      dry_run: true,
      target_margin_pct: plan.target_margin_pct,
      models_affected: plan.updates.length,
      changes: plan.changes,
      skipped: plan.skipped,
      hint: "POST again with apply:true to write these prices.",
    });
  }

  const applied: string[] = [];
  const failed: Array<{ model_id: string; error: string }> = [];
  for (const update of plan.updates) {
    const { error: upErr } = await supabase
      .schema("inference")
      .from("models")
      .update({ pricing: update.pricing })
      .eq("model_id", update.model_id);
    if (upErr) failed.push({ model_id: update.model_id, error: upErr.message });
    else applied.push(update.model_id);
  }

  // One row for the whole run, carrying every from->to, so a bad bulk reprice
  // can be reversed by hand. Records what was APPLIED, not what was planned —
  // a model whose update failed is in plan.changes but its price never moved,
  // and an audit trail that overstates what happened is worse than none.
  const appliedSet = new Set(applied);
  const appliedChanges = plan.changes.filter((c) => appliedSet.has(c.model_id));
  if (applied.length > 0) {
    void recordAdminAudit(
      bulkRepriceEntry(
        plan.target_margin_pct,
        applied,
        appliedChanges,
        body?.only_at_or_below_cost === false ? "all" : "underwater"
      ),
      { userId: adminCheck.userId, email: adminCheck.email },
      actorContext(req)
    );
  }

  return NextResponse.json({
    dry_run: false,
    target_margin_pct: plan.target_margin_pct,
    models_updated: applied.length,
    applied,
    failed,
    changes: plan.changes,
    skipped: plan.skipped,
  });
}
