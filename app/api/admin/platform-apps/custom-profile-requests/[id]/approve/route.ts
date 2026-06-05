import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { createServiceClient } from "@/lib/supabase/server";
import { validateCustomSpec } from "@/lib/validation/platform-apps";
import { logError } from "@/lib/api/error-sanitizer";
import { NotificationService } from "@/lib/notifications/service";

/**
 * POST /api/admin/platform-apps/custom-profile-requests/[id]/approve
 *
 * Admin approves a custom profile request.
 * Body: { custom_spec: CustomProfileSpec, hourly_rate: number, admin_notes?: string }
 *
 * On approval:
 *  1. Validates the spec
 *  2. Updates the request record (approved)
 *  3. Stores the approved profile as pending on the app
 *  4. Notifies the user to redeploy — redeploy is NOT triggered automatically.
 *     The user controls when their app picks up the new resources.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: requestId } = params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { custom_spec, hourly_rate, admin_notes } = body;

  const specError = validateCustomSpec(custom_spec, hourly_rate);
  if (specError) {
    return NextResponse.json({ error: specError }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();

    const { data: request, error: reqErr } = await supabase
      .from("platform_custom_profile_requests")
      .select("id, app_id, user_id, status")
      .eq("id", requestId)
      .single();

    if (reqErr || !request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (request.status !== "pending") {
      return NextResponse.json(
        { error: `Request is already ${request.status}` },
        { status: 409 }
      );
    }

    const { data: approvedRows, error: approveErr } = await supabase.rpc(
      "approve_platform_custom_profile_request",
      {
        p_request_id: requestId,
        p_custom_spec: custom_spec,
        p_hourly_rate: hourly_rate,
        p_admin_notes: typeof admin_notes === "string" ? admin_notes : "",
        p_reviewed_by: auth.user?.id ?? null,
      }
    );

    if (approveErr || !approvedRows?.[0]) {
      logError("approve custom profile request", approveErr);
      return NextResponse.json(
        { error: "Request is no longer pending or could not be approved" },
        { status: approveErr?.message.includes("not pending") ? 409 : 500 }
      );
    }

    const approved = approvedRows[0] as { app_id: string; user_id: string };
    const approvedRate = hourly_rate as number;

    try {
      await NotificationService.create({
        user_id: approved.user_id,
        type: "success",
        title: "Custom resource profile approved",
        message:
          `Your custom deployment profile has been approved at $${approvedRate}/hr. Redeploy your app from the Settings tab to activate it.`,
        service_type: "platform_app",
        service_id: approved.app_id,
        action: "updated",
        metadata: { custom_profile_approved: true },
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      success: true,
      message: "Request approved. User must redeploy to activate the custom profile.",
    });
  } catch (err) {
    logError("POST /api/admin/platform-apps/custom-profile-requests/[id]/approve", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
