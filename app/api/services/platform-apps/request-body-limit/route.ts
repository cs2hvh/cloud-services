import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { Platform_Apps } from "@/lib/supabase/queries";
import { resolveQuota } from "@/lib/services/platform-app-bandwidth/quota";
import { syncMaxRequestBodySize } from "@/lib/services/platform-app-bandwidth";

/**
 * PATCH /api/services/platform-apps/request-body-limit
 *
 * Set a custom NGINX proxy-body-size for one platform app.
 * The limit must be between 1 MB and the plan's max_request_body_mb.
 * NULL resets to the plan default.
 *
 * Body: { app_id: string; limit_mb: number | null }
 */
export async function PATCH(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-request-body-limit",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { app_id, limit_mb } = body as { app_id?: string; limit_mb?: number | null };

    if (!app_id) {
      return NextResponse.json({ error: "Missing required field: app_id" }, { status: 400 });
    }

    // limit_mb must be a positive integer or null (reset to plan default)
    if (limit_mb !== null && limit_mb !== undefined) {
      if (!Number.isInteger(limit_mb) || limit_mb < 1) {
        return NextResponse.json(
          { error: "limit_mb must be a positive integer (MB) or null to reset to plan default" },
          { status: 400 }
        );
      }
    }

    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    const app = appResult.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const quota = await resolveQuota(app.size);
    const planMaxMb = quota.maxRequestBodyBytes !== null
      ? Math.floor(quota.maxRequestBodyBytes / (1024 * 1024))
      : null;

    if (limit_mb !== null && limit_mb !== undefined && planMaxMb !== null) {
      if (limit_mb > planMaxMb) {
        return NextResponse.json(
          {
            error: "Limit exceeds plan maximum",
            message: `Your plan allows a maximum of ${planMaxMb} MB. Upgrade your plan for a higher limit.`,
            plan_max_mb: planMaxMb,
          },
          { status: 422 }
        );
      }
    }

    const updateResult = await Platform_Apps.update(app_id, {
      custom_request_body_mb: limit_mb ?? null,
    });
    if (!updateResult.success) {
      throw new Error(updateResult.error || "Failed to update app");
    }

    // Apply to ingress immediately — use custom value if set, otherwise plan default
    const effectiveMb = (limit_mb !== null && limit_mb !== undefined)
      ? limit_mb
      : (planMaxMb ?? null);
    const effectiveBytes = effectiveMb !== null ? effectiveMb * 1024 * 1024 : null;

    const syncResult = await syncMaxRequestBodySize(app.name, effectiveBytes);
    if (!syncResult.synced) {
      console.warn("[request-body-limit] Failed to apply to ingress:", syncResult.error);
    }

    return NextResponse.json({
      ok: true,
      custom_request_body_mb: limit_mb ?? null,
      effective_mb: effectiveMb,
      plan_max_mb: planMaxMb,
      ingress_synced: syncResult.synced,
    });
  } catch (err: unknown) {
    logError("services/platform-apps/request-body-limit", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
