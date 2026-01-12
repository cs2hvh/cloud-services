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
    return NextResponse.json({
      success: true,
      removed_vars: result.removed_vars,
      redeploy_triggered: result.redeploy_triggered,
      message: `Bucket unlinked successfully. ${result.removed_vars?.length || 0} environment variables removed.`,
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
