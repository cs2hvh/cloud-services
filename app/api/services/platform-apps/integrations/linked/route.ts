/**
 * GET /api/services/platform-apps/integrations/linked
 * 
 * Get linked databases for an app, or linked apps for a database
 * 
 * Query Parameters:
 * - app_id: string - Get all databases linked to this app
 * - database_id: string - Get all apps linked to this database
 * 
 * Note: Provide either app_id OR database_id, not both
 * 
 * Response (for app_id):
 * {
 *   success: boolean
 *   type: "databases"
 *   app_id: string
 *   integrations: Array<{
 *     integration_id: string
 *     database_cluster_id: string
 *     database_name?: string
 *     engine?: string
 *     status: string
 *     injected_env_keys: string[]
 *     linked_at: string
 *   }>
 * }
 * 
 * Response (for database_id):
 * {
 *   success: boolean
 *   type: "apps"
 *   database_id: string
 *   integrations: Array<{
 *     integration_id: string
 *     platform_app_id: string
 *     app_name?: string
 *     status: string
 *     injected_env_keys: string[]
 *     linked_at: string
 *   }>
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";

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
    // Parse query parameters
    // ========================================
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get("app_id");
    const database_id = searchParams.get("database_id");

    // Validate - need exactly one of app_id or database_id
    if (!app_id && !database_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Either app_id or database_id query parameter is required",
          code: "MISSING_PARAMETER" 
        },
        { status: 400 }
      );
    }

    if (app_id && database_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Provide either app_id or database_id, not both",
          code: "INVALID_PARAMETERS" 
        },
        { status: 400 }
      );
    }

    // ========================================
    // Fetch integrations
    // ========================================
    if (app_id) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(app_id)) {
        return NextResponse.json(
          { success: false, error: "Invalid app_id format", code: "INVALID_APP_ID" },
          { status: 400 }
        );
      }

      const result = await DatabaseIntegrationService.getLinkedDatabases(app_id);
      
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error, code: "FETCH_ERROR" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        type: "databases",
        app_id,
        count: result.data?.length || 0,
        integrations: result.data || [],
      });
    }

    if (database_id) {
      // Validate database_id is a non-empty string
      if (database_id.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "Invalid database_id format", code: "INVALID_DATABASE_ID" },
          { status: 400 }
        );
      }

      const result = await DatabaseIntegrationService.getLinkedApps(database_id);
      
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error, code: "FETCH_ERROR" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        type: "apps",
        database_id,
        count: result.data?.length || 0,
        integrations: result.data || [],
      });
    }

    // This should never be reached due to earlier validation
    return NextResponse.json(
      { success: false, error: "Invalid request", code: "INVALID_REQUEST" },
      { status: 400 }
    );

  } catch (error) {
    console.error("[API] /integrations/linked error:", error);
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
