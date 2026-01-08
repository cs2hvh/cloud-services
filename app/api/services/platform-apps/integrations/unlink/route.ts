/**
 * POST /api/services/platform-apps/integrations/unlink
 * 
 * Unlink a database from a platform app
 * 
 * Request Body:
 * {
 *   app_id: string (required) - The platform app UUID
 *   database_id: string (required) - The database cluster ID
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
import { DatabaseIntegrationService } from "@/lib/services/database-integration";

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
      database_id?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { app_id, database_id } = body;

    // Validate required fields
    if (!app_id) {
      return NextResponse.json(
        { success: false, error: "app_id is required", code: "MISSING_APP_ID" },
        { status: 400 }
      );
    }

    if (!database_id) {
      return NextResponse.json(
        { success: false, error: "database_id is required", code: "MISSING_DATABASE_ID" },
        { status: 400 }
      );
    }

    // Validate UUID format for app_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(app_id)) {
      return NextResponse.json(
        { success: false, error: "Invalid app_id format", code: "INVALID_APP_ID" },
        { status: 400 }
      );
    }

    // Validate database_id is a non-empty string (cluster_id format)
    if (typeof database_id !== "string" || database_id.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid database_id format", code: "INVALID_DATABASE_ID" },
        { status: 400 }
      );
    }

    // ========================================
    // Perform unlink operation
    // ========================================
    const result = await DatabaseIntegrationService.unlink({
      app_id,
      database_id,
      user_id: user.id,
    });

    // ========================================
    // Return appropriate response
    // ========================================
    if (!result.success) {
      const statusCode = 
        result.code === "NOT_LINKED" ? 404 :
        result.code === "APP_NOT_FOUND" ? 404 :
        result.code === "PERMISSION_DENIED" ? 403 :
        400;

      return NextResponse.json(result, { status: statusCode });
    }

    // Success response
    return NextResponse.json({
      success: true,
      removed_vars: result.removed_vars,
      redeploy_triggered: result.redeploy_triggered,
      message: result.redeploy_triggered
        ? "Database unlinked successfully. Redeploy triggered to apply changes."
        : "Database unlinked successfully. Changes will apply on next deploy.",
    });

  } catch (error) {
    console.error("[API] /integrations/unlink error:", error);
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
