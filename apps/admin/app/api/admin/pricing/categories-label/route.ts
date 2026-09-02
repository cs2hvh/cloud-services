import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

/**
 * pricing_categories.starting_price_label is the only pricing string a
 * visitor sees before signing up, it is hand-typed, and until now nothing
 * owned it — so it drifted from the price book silently. The panel owns it
 * now: edits land here, audited, and the /pricing card shows the label next
 * to the book's actual floor so drift is visible instead of invisible.
 */
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  let body: { id?: number; starting_price_label?: string; starting_price_description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  const label = String(body.starting_price_label ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
  }
  if (!label || label.length > 40) {
    return NextResponse.json(
      { success: false, error: "starting_price_label required (max 40 chars)" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceClient();
    const { data: before } = await supabase
      .from("pricing_categories")
      .select("slug, label, starting_price_label, starting_price_description")
      .eq("id", id)
      .maybeSingle();
    if (!before) {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }

    const updates: Record<string, string> = { starting_price_label: label };
    if (body.starting_price_description !== undefined) {
      updates.starting_price_description = String(body.starting_price_description).slice(0, 200);
    }

    const { error } = await supabase
      .from("pricing_categories")
      .update(updates)
      .eq("id", id);
    if (error) {
      console.error("[Admin Pricing] category label update failed:", error.message);
      return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
    }

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "update",
      service_type: "pricing",
      service_id: `category-label:${before.slug}`,
      service_name: `Marketing label — ${before.label}`,
      before_state: {
        starting_price_label: before.starting_price_label,
        starting_price_description: before.starting_price_description,
      },
      after_state: updates,
      metadata: { via: "admin-panel" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin Pricing] category label unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
