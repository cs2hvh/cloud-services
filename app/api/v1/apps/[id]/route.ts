// GET /api/v1/apps/[id] — get a single app by ID
// PATCH /api/v1/apps/[id] — update app metadata (does NOT redeploy)
// DELETE /api/v1/apps/[id] — delete app and all infrastructure
import { Platform_Apps } from "@/lib/supabase/queries";
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { updatePlatformAppSchema } from "@/lib/validation/platform-apps";
import { DeploymentService } from "@/lib/services";
import { Billing } from "@/lib/supabase/queries/billing";

// Helper to extract and validate app ID
async function getValidatedAppId(context: { params: Promise<{ [key: string]: string | string[] }> } | undefined) {
  if (!context?.params) {
    return { error: v1Error("Missing route context", 500), id: null };
  }
  const rawParams = await context.params;
  const id = Array.isArray(rawParams.id) ? rawParams.id[0] : rawParams.id;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return { error: v1Error({ code: "INVALID_ID", field: "id" }, 400, "Invalid app ID format"), id: null };
  }

  return { error: null, id };
}

export const GET = withV1Auth("apps:get", async (_req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  const result = await Platform_Apps.get(id!);

  if (!result.success) {
    return v1Error({ code: "NOT_FOUND" }, 404, "App not found");
  }

  const app = result.data;

  // Verify ownership
  if (app.user_id !== auth.userId) {
    return v1Error({ code: "FORBIDDEN" }, 403, "Access denied");
  }

  return v1Ok({
    data: {
      id: app.id,
      name: app.name,
      slug: app.slug,
      framework: app.framework,
      repository_name: app.repository_name,
      repository_url: app.repository_url,
      branch: app.branch,
      status: app.status,
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
});

export const PATCH = withV1Auth("apps:update", async (req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  // Parse and validate request body
  const body = await req.json();
  const updateData = body;

  // Add app_id to validation (use validated route id)
  const validation = updatePlatformAppSchema.safeParse({ app_id: id, ...updateData });

  if (!validation.success) {
    const errors = validation.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return v1Error({ validation_errors: errors }, 400, "Invalid request body");
  }

  // Get existing app to verify ownership
  const existing = await Platform_Apps.get(id!);
  if (!existing.success) {
    return v1Error({ code: "NOT_FOUND" }, 404, "App not found");
  }

  // Verify ownership
  if (existing.data.user_id !== auth.userId) {
    return v1Error({ code: "FORBIDDEN" }, 403, "Access denied");
  }

  // Update app (metadata only - does NOT trigger redeployment)
  const result = await Platform_Apps.update(id!, updateData);

  if (!result.success) {
    return v1Error({ code: "UPDATE_FAILED", details: result.error }, 500, "Failed to update app");
  }

  return v1Ok({
    data: {
      id: result.data.id,
      name: result.data.name,
      slug: result.data.slug,
      framework: result.data.framework,
      repository_name: result.data.repository_name,
      branch: result.data.branch,
      status: result.data.status,
      deployment_url: result.data.deployment_url,
      updated_at: result.data.updated_at,
    },
  });
});

export const DELETE = withV1Auth("apps:delete", async (_req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  // Get app details before deletion
  const appResult = await Platform_Apps.get(id!);
  if (!appResult.success) {
    return v1Error({ code: "NOT_FOUND" }, 404, "App not found");
  }

  const app = appResult.data;

  // Verify ownership
  if (app.user_id !== auth.userId) {
    return v1Error({ code: "FORBIDDEN" }, 403, "Access denied");
  }

  try {
    // Delete app using DeploymentService (handles infrastructure cleanup)
    await DeploymentService.delete(id!, auth.userId, false);

    // Stop billing (prorated final charge)
    try {
      await Billing.close_active_service("platform_apps", {
        userId: auth.userId,
        serviceId: id!,
        failOnInsufficient: false, // Don't block deletion if user has no balance
      });
      console.log(`[DELETE /api/v1/apps/{id}] Billing closed for app ${id}`);
    } catch (billingError) {
      console.warn(`[DELETE /api/v1/apps/{id}] Billing closure failed (non-blocking):`, billingError);
      // Don't fail the deletion - billing can be handled separately
    }

    return v1Ok({
      data: {
        id: id!,
        name: app.name,
        deleted: true,
      },
    });
  } catch (deleteError) {
    const errorMessage = deleteError instanceof Error ? deleteError.message : "Unknown error";
    
    // Map error messages to appropriate status codes
    if (errorMessage === "App not found") {
      return v1Error({ code: "NOT_FOUND" }, 404, "App not found");
    }
    if (errorMessage === "Unauthorized") {
      return v1Error({ code: "FORBIDDEN" }, 403, "Access denied");
    }

    console.error(`[DELETE /api/v1/apps/{id}] Deletion failed:`, deleteError);
    return v1Error(
      { code: "DELETE_FAILED", details: errorMessage },
      500,
      "Failed to delete app. Infrastructure cleanup may be incomplete."
    );
  }
});
