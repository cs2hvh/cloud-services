import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { rollbackPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_App_Deployments, Platform_Apps } from "@/lib/supabase/queries";
import { KubernetesInfoService } from "@/lib/services/kubernetes-info";

function buildImageRef(imageTag?: string | null, imageDigest?: string | null): string | null {
  const tag = imageTag?.trim();
  const digest = imageDigest?.trim();

  if (tag && digest && !tag.includes("@")) {
    return `${tag}@${digest}`;
  }

  if (tag) return tag;

  return null;
}

/**
 * POST /api/services/platform-apps/rollback
 * Rolls back an app to the previous successful deployment (no new build).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
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
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const operationLock = await Platform_App_Deployments.get_operation_lock(app_id, appResult.data.status);
    if (!operationLock.success) {
      return NextResponse.json({ error: operationLock.message || "Failed to check deployment state" }, { status: 500 });
    }
    if (operationLock.blocked) {
      return NextResponse.json(
        { error: operationLock.blocker === 'deleting' ? "App is being deleted and cannot be rolled back." : "Cannot roll back while a deployment is in progress." },
        { status: 409 }
      );
    }

    const activeDeploymentId: string | null = app.active_deployment_id ?? null;

    const previous = await Platform_App_Deployments.get_previous_rollback_target(app_id, activeDeploymentId);
    if (!previous.success) {
      return NextResponse.json({ error: previous.error || "Failed to query deployment history" }, { status: 500 });
    }

    if (!previous.data) {
      return NextResponse.json(
        { error: "No previous successful deployment to roll back to" },
        { status: 409 }
      );
    }

    const imageRef = buildImageRef(previous.data.image_tag, previous.data.image_digest);
    if (!imageRef) {
      return NextResponse.json(
        { error: "Previous deployment is missing an image reference" },
        { status: 500 }
      );
    }

    // Patch Kubernetes deployment image (no build)
    const patch = await KubernetesInfoService.patchAppDeploymentImage(app.name, imageRef, "default");
    if (!patch.success) {
      return NextResponse.json({ error: patch.error || "Failed to roll back deployment" }, { status: 500 });
    }

    // Record rollback as a deployment event (build_number is null)
    const record = await Platform_App_Deployments.create({
      app_id,
      build_number: null,
      commit_sha: previous.data.commit_sha ?? null,
      image_tag: previous.data.image_tag ?? null,
      image_digest: previous.data.image_digest ?? null,
      status: "success",
      trigger: "rollback",
    });

    await Promise.all([
      Platform_App_Deployments.set_active_for_app(
        app_id,
        record.success ? record.data.id : previous.data.id
      ),
      Platform_Apps.update(app_id, {
        status: "running",
        last_deploy_trigger: "rollback",
        last_deploy_commit: previous.data.commit_sha ?? null,
        last_failure_reason: null,
      }),
    ]);

    // Best-effort: log images after rollback
    KubernetesInfoService.logAppImages(app.name, `rollback app_id=${app_id}`).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      app_id,
      rolled_back_to: {
        deployment_id: previous.data.id,
        image: imageRef,
        commit_sha: previous.data.commit_sha ?? null,
      },
      rollback_record_id: record.success ? record.data.id : null,
      warning: record.success ? null : record.error || "Rollback event could not be recorded, but serving state was updated.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
