import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PRICE_KEYS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
] as const;

/**
 * Update a catalog model: activate/deactivate, feature, or set customer
 * pricing (cents per Mtok). Pricing merges over the existing jsonb so keys
 * not sent stay untouched. Every change is audited.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    is_active?: boolean;
    is_featured?: boolean;
    pricing?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.is_featured === "boolean")
    updates.is_featured = body.is_featured;

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const { data: existing, error: readErr } = await inference
      .from("models")
      .select("id, model_id, display_name, pricing, is_active, is_featured")
      .eq("id", id)
      .maybeSingle();

    if (readErr) {
      console.error("[Admin AI] model read failed:", readErr.message);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    if (body.pricing !== undefined) {
      const merged: Record<string, unknown> = {
        ...((existing.pricing as Record<string, unknown>) ?? {}),
      };
      for (const key of PRICE_KEYS) {
        const value = body.pricing[key];
        if (value === undefined) continue;
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0) {
          return NextResponse.json(
            { error: `${key} must be a number >= 0` },
            { status: 400 },
          );
        }
        merged[key] = num;
      }
      updates.pricing = merged;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await inference
      .from("models")
      .update(updates)
      .eq("id", id)
      .select(
        "id, model_id, display_name, modality, serving_type, org_id, pricing, upstream_pricing, is_active, is_featured",
      )
      .single();

    if (error) {
      console.error("[Admin AI] model update failed:", error.message);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    try {
      await AuditLogService.create({
        user_id: admin.userId || "",
        user_email: admin.email,
        user_role: "admin",
        action: "update",
        service_type: "ai_agent",
        service_id: existing.model_id,
        service_name: existing.display_name || existing.model_id,
        metadata: {
          operation: "admin.inference.model.update",
          before: {
            pricing: existing.pricing,
            is_active: existing.is_active,
            is_featured: existing.is_featured,
          },
          updates,
        },
        user_agent: request.headers.get("user-agent") || undefined,
      });
    } catch {
      // audit must never fail the action
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[Admin AI] model update unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
