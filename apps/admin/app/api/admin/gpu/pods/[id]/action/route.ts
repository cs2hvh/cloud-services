import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { podLifecycleOperations } from "@/lib/services/runpod/operations/pod-lifecycle-operations";
import { AuditLogService } from "@/lib/audit/service";
import { requireCustomerDataAccess } from "@admin/lib/customer-data";

export const dynamic = "force-dynamic";

/**
 * Admin lifecycle actions on a customer pod. Destructive and money-moving,
 * so: explicit gate, full audit (which admin, whose pod, what action), and
 * the existing owner-scoped lifecycle operations are reused with the pod's
 * REAL owner id — elevate the operation, never the authorization decision.
 * powerPod/destroyPod close and re-rate meters themselves; nothing here
 * touches billing directly.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireCustomerDataAccess();
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const { id } = await ctx.params;
  const podId = Number(id);
  if (!Number.isInteger(podId) || podId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid pod id" }, { status: 400 });
  }

  let action: string;
  try {
    action = String((await request.json()).action ?? "");
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!["start", "stop", "terminate"].includes(action)) {
    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();
    const { data: pod } = await supabase
      .from("gpu_pods")
      .select("id, name, owner_id, owner_email, status")
      .eq("id", podId)
      .maybeSingle();
    if (!pod) {
      return NextResponse.json({ success: false, error: "Pod not found" }, { status: 404 });
    }

    const result =
      action === "terminate"
        ? await podLifecycleOperations.destroyPod({ podId, ownerId: pod.owner_id })
        : await podLifecycleOperations.powerPod({
            podId,
            ownerId: pod.owner_id,
            action: action as "start" | "stop",
          });

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: action === "terminate" ? "delete" : "update",
      service_type: "gpu",
      service_id: String(podId),
      service_name: pod.name,
      before_state: { status: pod.status, owner: pod.owner_email ?? pod.owner_id },
      after_state: {
        admin_action: action,
        success: result.success,
        error: result.success ? null : result.error,
      },
      metadata: { via: "admin-panel" },
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Action failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin GPU] pod action failed:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
