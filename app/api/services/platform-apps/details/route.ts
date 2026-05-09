import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { KubernetesInfoService } from "@/lib/services/kubernetes-info";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/services/platform-apps/details?app_id=xxx
 * Get detailed Kubernetes information for an app
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-details",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Get app_id from query params
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");

    if (!appId) {
      return NextResponse.json(
        { error: "Missing 'app_id' parameter" },
        { status: 400 }
      );
    }

    // Verify ownership
    const result = await Platform_Apps.get(appId);
    if (!result.success || !result.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    const app = result.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get detailed info from Kubernetes
    const details = await KubernetesInfoService.getAppDetails(app.name);

    return NextResponse.json({
      app_id: appId,
      app_name: app.name,
      ...details,
    });
  } catch (err: unknown) {
    logError("services/platform-apps/details", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
