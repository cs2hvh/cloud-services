import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { createServiceClient } from "@/lib/supabase/server";
import { logError } from "@/lib/api/error-sanitizer";
import { NotificationService } from "@/lib/notifications/service";

/**
 * POST /api/admin/platform-apps/custom-profile-requests/[id]/reject
 * Body: { admin_notes?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: requestId } = params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* body is optional */ }

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

    const { data: rejected, error: updateErr } = await supabase
      .from("platform_custom_profile_requests")
      .update({
        status: "rejected",
        admin_notes: typeof body.admin_notes === "string" ? body.admin_notes.trim() : null,
        reviewed_by: auth.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      logError("reject custom profile request", updateErr);
      return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
    }
    if (!rejected) {
      return NextResponse.json(
        { error: "Request is no longer pending" },
        { status: 409 }
      );
    }

    try {
      await NotificationService.create({
        user_id: request.user_id,
        type: "warning",
        title: "Custom resource request reviewed",
        message: body.admin_notes
          ? `Your custom resource request was not approved at this time: ${body.admin_notes}`
          : "Your custom resource request was not approved at this time. Please contact support for more information.",
        service_type: "platform_app",
        service_id: request.app_id,
        action: "updated",
        metadata: { custom_profile_rejected: true },
      });
    } catch { /* Non-fatal */ }

    return NextResponse.json({ success: true, message: "Request rejected." });
  } catch (err) {
    logError("POST /api/admin/platform-apps/custom-profile-requests/[id]/reject", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
