import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateSpectrumAppSchema } from "@/lib/validation/spectrum";
import { updateSpectrumApp } from "@/config/spectrum-functions";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:spectrum-update",
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
    const validation = validateRequest(updateSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const adminCheck = await requireAdmin();

    // Get before state and enforce ownership for non-admins
    const beforeState = await Spectrum_Apps.get(validation.data.app_id);
    if (!beforeState.success || !beforeState.data) {
      return NextResponse.json({ error: "Spectrum app not found" }, { status: 404 });
    }

    if (!adminCheck.ok && beforeState.data.owner_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await updateSpectrumApp(validation.data);

    // Create audit log
    const auditContext = getAuditContext(req);
    
    if (beforeState.success) {
      await AuditLogService.create({
        user_id: auth.user!.id,
        user_role: adminCheck.ok ? 'admin' : 'user',
        user_email: auth.user?.email,
        action: 'update',
        service_type: 'network_ddos',
        service_id: validation.data.app_id,
        service_name: 'Spectrum App',
        before_state: beforeState.data,
        after_state: result,
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
      });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { errors?: Array<{ message?: string }> } }; message?: string }).response?.data?.errors?.[0]?.message || (err instanceof Error ? err.message : null) || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
