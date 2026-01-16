/**
 * GET /api/services/platform-apps/integrations/storage/linked
 * 
 * Get all linked object storage buckets for an app
 * 
 * Query Parameters:
 *   app_id: string (required) - The platform app UUID
 * 
 * Response:
 * {
 *   success: boolean
 *   data?: LinkedBucket[]
 *   error?: string
 *   code?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { ObjectStorageIntegrationService } from "@/lib/services/object-storage-integration";
import { Platform_Apps } from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
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
    // Get app_id from query params
    // ========================================
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get("app_id");

    if (!app_id) {
      return NextResponse.json(
        { success: false, error: "app_id is required", code: "MISSING_APP_ID" },
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

    // ========================================
    // Verify user owns the app
    // ========================================
    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json(
        { success: false, error: "App not found", code: "APP_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (appResult.data.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "You don't own this app", code: "PERMISSION_DENIED" },
        { status: 403 }
      );
    }

    // ========================================
    // Get linked buckets
    // ========================================
    const result = await ObjectStorageIntegrationService.getLinkedBuckets(app_id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, code: "FETCH_ERROR" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      count: result.data?.length || 0,
    });

  } catch (error) {
    console.error("[API] Get linked storage error:", error);
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
