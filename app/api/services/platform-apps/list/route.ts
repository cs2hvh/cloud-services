import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { AppStatusService } from "@/lib/services/app-status";
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
      includeRollbackInfo: true, // Internal API includes rollback capability
    });

    // Reconcile `status` against K8s before returning. Without this the list
    // renders whatever was last written by a deploy, so a transient K8s error
    // leaves apps showing "failed" indefinitely — nothing else re-checks them.
    // One API call for the whole namespace; on failure statuses are preserved.
    const typed = apps as Array<{ id: string; name: string; status: string; updated_at?: string | null }>;
    const { updates } = await AppStatusService.syncStatusesBulk(typed);
    for (const app of typed) {
      const next = updates.get(app.id);
      if (next) app.status = next;
    }

    return NextResponse.json({ apps });
  } catch (err: unknown) {
    logError("services/platform-apps/list", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
