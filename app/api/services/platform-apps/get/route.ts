import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-get",
      limit: 20,
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
    const validation = validateRequest(getPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    // Use shared service method (same logic as v1 API)
    const app = await PlatformAppService.getApp({
      appId: validation.data.app_id,
      userId: auth.user!.id,
      syncStatus: true,      // Internal API syncs K8s status
      includeEnvVars: false,
    });

    // Env var values are NOT included here — they are fetched on demand via
    // POST /api/services/platform-apps/env-vars/list to avoid sending
    // decrypted secrets on every page load.
    const deploymentPresentation = await PlatformAppService.getDeploymentPresentation({
      appId: validation.data.app_id,
      activeDeploymentId: typeof app.active_deployment_id === "string" ? app.active_deployment_id : null,
    });

    return NextResponse.json({ 
      ...app,
      ...deploymentPresentation,
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err) {
      const error = err as Error & { code?: string };
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json(
          { error: 'App not found', message: 'App not found' },
          { status: 404 }
        );
      }
      if (error.code === 'FORBIDDEN') {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Unauthorized' },
          { status: 403 }
        );
      }
    }
    logError("services/platform-apps/get", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
