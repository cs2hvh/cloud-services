/**
 * PUT /api/services/platform-apps/integrations/storage/update
 *
 * Update a storage integration's env var key mapping without requiring unlink + re-link.
 *
 * Request Body:
 * {
 *   app_id: string (required)
 *   bucket_id: string (required)
 *   env_mapping: Record<string, string> - old key → new key mapping
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { ObjectStorageIntegrationService } from "@/lib/services/object-storage-integration";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest) {
  try {
    // Auth
    const supabase = await createSSRClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Parse body
    let body: {
      app_id?: string;
      bucket_id?: string;
      env_mapping?: Record<string, string>;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { app_id, bucket_id, env_mapping } = body;

    if (!app_id || !bucket_id) {
      return NextResponse.json(
        { success: false, error: "app_id and bucket_id are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    if (!UUID_RE.test(app_id) || !UUID_RE.test(bucket_id)) {
      return NextResponse.json(
        { success: false, error: "Invalid UUID format", code: "INVALID_IDS" },
        { status: 400 }
      );
    }

    const result = await ObjectStorageIntegrationService.updateIntegration({
      app_id,
      bucket_id,
      user_id: user.id,
      env_mapping: env_mapping || {},
    });

    if (!result.success) {
      const statusCode =
        result.code === "NOT_LINKED" ? 404 :
        result.code === "APP_NOT_FOUND" ? 404 :
        result.code === "BUCKET_NOT_FOUND" ? 404 :
        result.code === "PERMISSION_DENIED" ? 403 :
        400;

      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json({
      ...result,
      message: result.requires_redeploy
        ? "Integration updated. Redeploy to apply build-time variable changes."
        : "Integration updated successfully.",
    });
  } catch (error) {
    console.error("[integrations/storage/update] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
