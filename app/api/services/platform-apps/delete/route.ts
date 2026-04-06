import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deletePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { requireAdmin } from "@/lib/supabase/auth";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { AppStatusService } from "@/lib/services/app-status";
import { Platform_App_Deployments, Platform_Apps } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-delete",
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
    const validation = validateRequest(deletePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, is_admin } = validation.data;

    // If admin flag is set, verify the user is actually an admin
    let isAdminUser = false;
    if (is_admin) {
      const adminCheck = await requireAdmin();
      if (!adminCheck.ok) {
        return NextResponse.json(
          {
            error: "Admin privileges required",
            message: "Admin privileges required",
          },
          { status: 403 }
        );
      }
      isAdminUser = true;
    }

    // Delete using shared service (handles all cleanup)
    let previousStatus: string | null = null;
    let previousFailureReason: string | null = null;
    try {
      // Verify app exists and check ownership before setting status
      const existing = await Platform_Apps.get(app_id);
      if (!existing.success || !existing.data) {
        return NextResponse.json({ error: "App not found", message: "App not found" }, { status: 404 });
      }
      if (!isAdminUser && existing.data.user_id !== auth.user!.id) {
        return NextResponse.json({ error: "Unauthorized", message: "Unauthorized" }, { status: 403 });
      }
      previousStatus = existing.data.status ?? null;
      previousFailureReason = existing.data.last_failure_reason ?? null;

      const operationLock = await Platform_App_Deployments.get_operation_lock(app_id, existing.data.status);
      if (!operationLock.success) {
        return NextResponse.json(
          { error: operationLock.message || "Failed to check deployment state", message: operationLock.message || "Failed to check deployment state" },
          { status: 500 }
        );
      }

      // Block deletion while a build is actively in progress
      if (operationLock.blocked) {
        return NextResponse.json(
          {
            error:
              operationLock.blocker === 'deleting'
                ? "App is already being deleted."
                : "Cannot delete while a build is in progress. Wait for the build to complete or fail.",
            message:
              operationLock.blocker === 'deleting'
                ? "App is already being deleted."
                : "Cannot delete while building",
          },
          { status: 409 }
        );
      }

      // Mark as "deleting" in DB so syncStatus skips this app and
      // Supabase Realtime pushes the visual "Deleting…" state to all clients.
      await AppStatusService.setStatus(app_id, "deleting");

      await PlatformAppService.deleteApp({
        appId: app_id,
        userId: auth.user!.id,
        isAdmin: isAdminUser,
        audit_context: {
          ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
          user_agent: req.headers.get("user-agent") || "unknown",
          request_id: crypto.randomUUID(),
          user_email: auth.user!.email,
          user_role: isAdminUser ? "admin" : "user",
        },
      });

      return NextResponse.json({ message: "App deleted successfully" });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const statusCode = errorMsg === "App not found" ? 404 :
                        errorMsg === "Unauthorized" ? 403 : 400;

      // Revert status from "deleting" back to the last known app state so the
      // control plane does not claim the app failed when deletion itself failed.
      try {
        if (previousStatus === "running") {
          await AppStatusService.setStatus(app_id, "running");
        } else if (previousStatus === "failed") {
          await AppStatusService.setStatus(app_id, "failed", previousFailureReason ?? undefined);
        } else if (previousStatus) {
          await Platform_Apps.update(app_id, {
            status: previousStatus,
            last_failure_reason: previousStatus === "failed" ? previousFailureReason : null,
          });
        }
      } catch { /* best-effort revert */ }

      return NextResponse.json(
        { error: errorMsg, message: errorMsg },
        { status: statusCode }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg, message: msg }, { status: 400 });
  }
}
