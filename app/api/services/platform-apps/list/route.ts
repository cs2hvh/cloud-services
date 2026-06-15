import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-list",
      limit: 30,
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

    // Use shared service method (same logic as v1 API)
    const apps = await PlatformAppService.listApps({
      userId: auth.user!.id,
      includeRollbackInfo: true,
      syncStatus: true, // Sync live K8s status so the list shows accurate state
    });

    return NextResponse.json({ apps });
  } catch (err: unknown) {
    logError("services/platform-apps/list", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
