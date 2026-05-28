import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updatePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { sanitizeError } from "@/lib/api/error-sanitizer";
import { Projects } from "@/lib/supabase/queries/projects";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";
import { sendServiceAlertEmail, resolveUserEmail } from "@/lib/services/shared/service-alert-email";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-update",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(updatePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, ...updateData } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await Platform_Apps.update(app_id, updateData);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Create audit log
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    
    await AuditLogService.create({
      user_id: auth.user!.id,
      user_role: adminCheck.ok ? 'admin' : 'user',
      user_email: auth.user?.email,
      action: 'update',
      service_type: 'platform_apps',
      service_id: app_id,
      service_name: existing.data.name,
      before_state: existing.data,
      after_state: result.data,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        changed_fields: Object.keys(updateData).filter(k => k !== 'app_id'),
      },
    });

    // Add project log if project_id exists
    if (existing.data.project_id) {
      try {
        const changedFields = Object.keys(updateData).filter(k => k !== 'app_id').join(', ');
        await Projects.add_log({
          project_id: existing.data.project_id,
          event: "Platform App Updated",
          text: `Updated app "${existing.data.name}" - Changed: ${changedFields || 'settings'}`,
        });
      } catch (logError) {
        console.warn('[platform-apps/update] Failed to add project log:', logError);
      }
    }

    // Send confirmation email
    try {
      const changedFields = Object.keys(updateData)
        .filter((k) => k !== "app_id")
        .join(", ");
      const recipient =
        auth.user?.email || (await resolveUserEmail(String(existing.data.user_id)));
      await sendServiceAlertEmail({
        serviceType: "app",
        userEmail: recipient,
        serviceName: existing.data.name,
        alertTitle: "Application updated",
        summary: `The settings for your application "${existing.data.name}" were updated.`,
        severity: "info",
        metadata: {
          Operation: "Update application",
          Application: existing.data.name,
          "Updated settings": changedFields || "settings",
        },
      });
    } catch (emailErr) {
      console.warn("[platform-apps/update] Email failed:", emailErr);
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
