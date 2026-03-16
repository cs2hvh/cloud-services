/**
 * POST /api/services/platform-apps/integrations/storage/unlink
 * 
 * Unlink an object storage bucket from a platform app
 * 
 * Request Body:
 * {
 *   app_id: string (required) - The platform app UUID
 *   bucket_id: string (required) - The object_spaces UUID
 * }
 * 
 * Response:
 * {
 *   success: boolean
 *   removed_vars?: string[]
 *   redeploy_triggered?: boolean
 *   message?: string
 *   error?: string
 *   code?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { ObjectStorageIntegrationService } from "@/lib/services/object-storage-integration";

export async function POST(req: NextRequest) {
  try {
    // ========================================
    // Authentication
    // ========================================
    const supabase = await createSSRClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // ========================================
    // Parse and validate request body
    // ========================================
    let body: {
      app_id?: string;
      bucket_id?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { app_id, bucket_id } = body;

    // Validate required fields
    if (!app_id) {
      return NextResponse.json(
        { success: false, error: "app_id is required", code: "MISSING_APP_ID" },
        { status: 400 }
      );
    }

    if (!bucket_id) {
      return NextResponse.json(
        { success: false, error: "bucket_id is required", code: "MISSING_BUCKET_ID" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(app_id)) {
      return NextResponse.json(
        { success: false, error: "Invalid app_id format", code: "INVALID_APP_ID" },
        { status: 400 }
      );
    }

    if (!uuidRegex.test(bucket_id)) {
      return NextResponse.json(
        { success: false, error: "Invalid bucket_id format", code: "INVALID_BUCKET_ID" },
        { status: 400 }
      );
    }

    // ========================================
    // Perform unlink operation
    // ========================================
    const result = await ObjectStorageIntegrationService.unlink({
      app_id,
      bucket_id,
      user_id: user.id,
    });

    // Handle specific error codes
    if (!result.success) {
      const statusMap: Record<string, number> = {
        "NOT_LINKED": 404,
        "APP_NOT_FOUND": 404,
        "PERMISSION_DENIED": 403,
        "ENV_REMOVAL_FAILED": 500,
      };

      const status = statusMap[result.code || ""] || 500;

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          code: result.code,
        },
        { status }
      );
    }

    // Success response
    const hasLifecycleFields =
      typeof result.applied_live === "boolean" || typeof result.requires_redeploy === "boolean";
    const ignoredByPipeline =
      hasLifecycleFields &&
      result.applied_live === false &&
      result.requires_redeploy === false &&
      result.apply_mode === "persisted_only";
    const message = ignoredByPipeline
      ? "Bucket unlinked successfully, but affected keys are ignored by this framework pipeline."
      : hasLifecycleFields
        ? result.applied_live
          ? result.requires_redeploy
            ? "Bucket unlinked successfully. Runtime changes are live; redeploy to apply build-time variables."
            : "Bucket unlinked successfully. Changes applied with app restart."
          : result.requires_redeploy
            ? "Bucket unlinked successfully. Changes are saved; redeploy to apply them."
            : `Bucket unlinked successfully. ${result.removed_vars?.length || 0} environment variables removed.`
        : `Bucket unlinked successfully. ${result.removed_vars?.length || 0} environment variables removed.`;

    return NextResponse.json({
      success: true,
      removed_vars: result.removed_vars,
      redeploy_triggered: result.redeploy_triggered,
      applied_live: result.applied_live,
      requires_redeploy: result.requires_redeploy,
      apply_mode: result.apply_mode,
      hint: result.hint,
      reason: result.reason,
      message,
    });

  } catch (error) {
    console.error("[API] Storage unlink error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Internal server error", 
        code: "INTERNAL_ERROR" 
      },
      { status: 500 }
    );
  }
}
