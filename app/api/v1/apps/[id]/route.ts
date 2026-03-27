// GET /api/v1/apps/[id] — get a single app by ID
// PATCH /api/v1/apps/[id] — update app metadata (does NOT redeploy)
// DELETE /api/v1/apps/[id] — delete app and all infrastructure
import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { z } from "zod";

// Helper to extract and validate app ID
async function getValidatedAppId(context: { params: Promise<{ [key: string]: string | string[] }> } | undefined) {
  if (!context?.params) {
    return { error: v1Error("INTERNAL_ERROR", 500, "Missing route context"), id: null };
  }
  const rawParams = await context.params;
  const id = Array.isArray(rawParams.id) ? rawParams.id[0] : rawParams.id;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return { error: v1Error("INVALID_ID", 400, "Invalid app ID format", { field: "id" }), id: null };
  }

  return { error: null, id };
}

const updateV1AppSchema = z.object({
  name: z.string().min(3, "App name must be at least 3 characters").max(40, "App name must be at most 40 characters").optional(),
  auto_deploy: z.boolean().optional(),
});

export const GET = withV1Auth("apps:get", async (_req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  try {
    // Use shared service with live status sync from Kubernetes
    const app = await PlatformAppService.getApp({
      appId: id!,
      userId: auth.userId,
      syncStatus: true,  // ✅ Sync live status from K8s
      includeEnvVars: false,
    });

    return v1Ok({
      data: {
        id: app.id,
        name: app.name,
        slug: app.slug,
        framework: app.framework,
        repository_name: app.repository_name,
        repository_url: app.repository_url,
        branch: app.branch,
        status: app.status,  // This is now live status from K8s
        deployment_url: app.deployment_url,
        port: app.port,
        ip: app.ip,
        size: app.size,
        auto_deploy: app.auto_deploy,
        git_provider: app.git_provider,
        build_command: app.build_command,
        output_directory: app.output_directory,
        created_at: app.created_at,
        updated_at: app.updated_at,
      },
    });
  } catch (getError: unknown) {
    const error = getError as Error & { code?: string };
    
    if (error.code === 'NOT_FOUND') {
      return v1Error("NOT_FOUND", 404, "App not found");
    }
    if (error.code === 'FORBIDDEN') {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }

    console.error(`[GET /api/v1/apps/{id}] Failed:`, error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch app");
  }
});

export const PATCH = withV1Auth("apps:update", async (req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1ValidationError(
      [{ path: "body", message: "Invalid JSON in request body" }],
      "Invalid request body"
    );
  }
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

  const validation = updateV1AppSchema.safeParse(body);

  if (!validation.success) {
    const errors = validation.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return v1ValidationError(errors);
  }

  let result;
  try {
    result = await PlatformAppService.updateAppMetadata({
      appId: id!,
      userId: auth.userId,
      name: validation.data.name,
      autoDeploy: validation.data.auto_deploy,
    });
  } catch (updateError: unknown) {
    const error = updateError as Error & { code?: string; details?: unknown };
    if (error.code === "NOT_FOUND") {
      return v1Error("NOT_FOUND", 404, "App not found");
    }
    if (error.code === "FORBIDDEN") {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }
    return v1Error("UPDATE_FAILED", 500, "Failed to update app", { details: error.details || error.message });
  }

  return v1Ok({
    data: {
      id: result.id,
      name: result.name,
      slug: result.slug,
      framework: result.framework,
      repository_name: result.repository_name,
      branch: result.branch,
      status: result.status,
      deployment_url: result.deployment_url,
      updated_at: result.updated_at,
    },
  });
});

export const DELETE = withV1Auth("apps:delete", async (req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  let app: Awaited<ReturnType<typeof PlatformAppService.getApp>>;
  try {
    app = await PlatformAppService.getApp({
      appId: id!,
      userId: auth.userId,
      syncStatus: false,
      includeEnvVars: false,
    });
  } catch (getError: unknown) {
    const getAppError = getError as Error & { code?: string };
    if (getAppError.code === "NOT_FOUND") {
      return v1Error("NOT_FOUND", 404, "App not found");
    }
    if (getAppError.code === "FORBIDDEN") {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch app");
  }

  try {
    // Delete using shared service (handles all cleanup: infrastructure, billing, logs, notifications)
    await PlatformAppService.deleteApp({
      appId: id!,
      userId: auth.userId,
      isAdmin: false,
      audit_context: {
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        user_email: auth.kind === 'session' ? auth.email : undefined,
        user_role: "user",
      },
    });

    return v1Ok({
      data: {
        id: id!,
        name: app.name,
        deleted: true,
      },
    });
  } catch (deleteError) {
    const error = deleteError as Error & { code?: string };
    const errorMessage = deleteError instanceof Error ? deleteError.message : "Unknown error";

    // Prefer structured error codes when available
    if (error.code === 'NOT_FOUND') {
      return v1Error("NOT_FOUND", 404, "App not found");
    }
    if (error.code === 'FORBIDDEN') {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }

    // Fallback to legacy message checks for downstream services that throw plain messages
    if (errorMessage === "App not found") {
      return v1Error("NOT_FOUND", 404, "App not found");
    }
    if (errorMessage === "Unauthorized") {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }

    console.error(`[DELETE /api/v1/apps/{id}] Deletion failed:`, deleteError);
    return v1Error(
      "DELETE_FAILED",
      500,
      "Failed to delete app. Infrastructure cleanup may be incomplete.",
      { details: errorMessage }
    );
  }
});
