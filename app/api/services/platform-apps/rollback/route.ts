import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { rollbackPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_App_Deployments, Platform_Apps } from "@/lib/supabase/queries";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { KubernetesInfoService } from "@/lib/services/kubernetes-info";
import { getIdempotencyKey } from "@/lib/idempotency";
import {
  AppOperationError,
  AppRuntimeMutationService,
  parseOperationDetails,
} from "@/lib/app-operations";
import { buildImageRef } from "@/lib/container-image/image-ref";

/**
 * POST /api/services/platform-apps/rollback
 * Rolls back an app to the previous successful deployment (no new build).
 * Uses get_rollback_context as the single source of truth for eligibility.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const userId = auth.user.id;

  try {
    const rl = await limitByUser(userId, {
      prefix: "rl:platform-app-rollback",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(rollbackPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id } = validation.data;

    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const app = appResult.data as { user_id: string; active_deployment_id?: string | null; name: string };
    if (app.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const activeDeploymentId: string | null = app.active_deployment_id ?? null;

    // Single source of truth: get_rollback_context determines eligibility
    const ctx = await Platform_App_Deployments.get_rollback_context(app_id, activeDeploymentId);
    if (!ctx.success) {
      return NextResponse.json({ error: ctx.error || "Failed to query deployment history" }, { status: 500 });
    }

    if (!ctx.data.can_rollback || !ctx.data.rollback_target) {
      return NextResponse.json(
        { error: "No previous release different from the current serving release is available" },
        { status: 409 }
      );
    }

    const target = ctx.data.rollback_target;

    const imageRef = buildImageRef(
      typeof target.image_tag === "string" ? target.image_tag : null,
      typeof target.image_digest === "string" ? target.image_digest : null,
    );
    if (!imageRef) {
      return NextResponse.json(
        { error: "Previous deployment is missing an image reference" },
        { status: 500 }
      );
    }

    const targetId = typeof target.id === "string" ? target.id : null;
    if (!targetId) {
      return NextResponse.json({ error: "Rollback target is missing a deployment id" }, { status: 500 });
    }

    const targetBuildNumber =
      typeof target.build_number === "number" && target.build_number > 0
        ? target.build_number
        : null;
    if (targetBuildNumber === null) {
      return NextResponse.json(
        { error: "Rollback target is missing a valid build number" },
        { status: 500 }
      );
    }

    const mutationService = new AppRuntimeMutationService();
    const result = await mutationService.rollback({
      auditContext: {
        userId,
        userEmail: auth.user.email,
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        requestId: crypto.randomUUID(),
      },
      appId: app_id,
      appName: app.name,
      appStatus: appResult.data.status,
      appFailureReason:
        typeof appResult.data.last_failure_reason === "string"
          ? appResult.data.last_failure_reason
          : null,
      activeDeploymentId,
      commitSha: typeof target.commit_sha === "string" ? target.commit_sha : null,
      rollbackTargetBuildNumber: targetBuildNumber,
      targetDeploymentId: targetId,
      imageRef,
      imageTag: typeof target.image_tag === "string" ? target.image_tag : null,
      imageDigest: typeof target.image_digest === "string" ? target.image_digest : null,
      idempotencyKey: getIdempotencyKey(req.headers),
      executor: async () => {
        const patch = await KubernetesInfoService.patchAppDeploymentImage(app.name, imageRef, "default");
        if (!patch.success) {
          throw new Error(patch.error || "Failed to roll back deployment");
        }
      },
    });

    // Best-effort: log images after rollback
    KubernetesInfoService.logAppImages(app.name, `rollback app_id=${app_id}`).catch(() => undefined);

    const operationDetails = parseOperationDetails(result.operation.operation_details, {
      trigger: result.operation.trigger,
    });

    return NextResponse.json({
      ok: true,
      app_id,
      operation_id: result.operation.id,
      reused: result.reused,
      status: result.operation.status,
      rolled_back_to: {
        deployment_id: targetId,
        build_number: targetBuildNumber,
        image: imageRef,
        commit_sha: typeof target.commit_sha === "string" ? target.commit_sha : null,
      },
      rollback_record_id: result.operation.id,
      verification: operationDetails.verification ?? null,
      warning:
        operationDetails.verification?.status === "degraded"
          ? operationDetails.verification?.message ?? null
          : null,
    });
  } catch (err: unknown) {
    if (err instanceof AppOperationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    logError("services/platform-apps/rollback", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
