import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

/** Enable/disable a GPU model or template. Audited. */
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  let body: { kind?: string; id?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const table =
    body.kind === "catalog" ? "gpu_catalog" : body.kind === "template" ? "gpu_templates" : null;
  const id = String(body.id ?? "");
  const isActive = Boolean(body.is_active);
  if (!table || !id) {
    return NextResponse.json({ success: false, error: "kind and id required" }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(table)
      .update({ is_active: isActive })
      .eq("id", id)
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
    }

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "update",
      service_type: "gpu",
      service_id: `${table}:${id}`,
      service_name: id,
      after_state: { is_active: isActive },
      metadata: { via: "admin-panel" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin GPU] catalog toggle failed:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
