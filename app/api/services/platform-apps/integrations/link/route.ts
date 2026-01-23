/**
 * POST /api/services/platform-apps/integrations/link
 * 
 * Link a database to a platform app
 * 
 * Request Body:
 * {
 *   app_id: string (required) - The platform app UUID
 *   database_id: string (required) - The database cluster ID
 *   force?: boolean - Overwrite existing env vars (default: false)
 *   env_prefix?: string - Custom prefix for env vars (default: "DATABASE")
 *   env_mapping?: Record<string, string> - Custom key name mapping (e.g., { "DATABASE_URL": "MY_DB_URL" })
 * }
 * 
 * Response:
 * {
 *   success: boolean
 *   integration_id?: string
 *   injected_vars?: string[]
 *   redeploy_triggered?: boolean
 *   message?: string
 *   conflicts?: string[] (if ENV_VAR_CONFLICT)
 *   error?: string
 *   code?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

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
      force?: boolean;
      env_prefix?: string;
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

    const { app_id, database_id, force, env_prefix, env_mapping } = body;

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

    // ========================================
    // Perform link operation
    // ========================================
    const result = await DatabaseIntegrationService.link({
      app_id,
      database_id,
      user_id: user.id,
      force: force === true,
      env_prefix: env_prefix || "DATABASE",
      env_mapping: env_mapping || undefined,
    });

    // ========================================
    // Return appropriate response
    // ========================================
    if (!result.success) {
      // Determine appropriate status code based on error
      const statusCode = 
        result.code === "ENV_VAR_CONFLICT" ? 409 :
        result.code === "ALREADY_LINKED" ? 409 :
        result.code === "APP_NOT_FOUND" ? 404 :
        result.code === "DATABASE_NOT_FOUND" ? 404 :
        result.code === "APP_NOT_OWNED" ? 403 :
        result.code === "DATABASE_NOT_OWNED" ? 403 :
        result.code === "PERMISSION_DENIED" ? 403 :
        400;

      return NextResponse.json(result, { status: statusCode });
    }

    // Success response
    if (result.success && result.app_name && result.database_name) {
      // Create audit log
      try {
        const context = getAuditContext(req);
        await AuditLogService.create({
          user_id: user.id,
          user_role: 'user',
          user_email: user.email,
          action: 'update',
          service_type: 'platform_apps',
          service_id: app_id,
          service_name: result.app_name,
          after_state: { 
            database_linked: database_id,
            database_name: result.database_name,
            injected_vars: result.injected_vars 
          },
          metadata: { 
            operation: 'database_linked',
            redeploy_triggered: result.redeploy_triggered 
          },
          ...context,
        });
      } catch (auditErr) {
        console.error('[linkDatabase] Failed to create audit log:', auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      integration_id: result.integration_id,
      injected_vars: result.injected_vars,
      redeploy_triggered: result.redeploy_triggered,
      message: result.redeploy_triggered 
        ? "Database linked successfully. Redeploy triggered to apply changes."
        : "Database linked successfully. Environment variables will apply on next deploy.",
    });

  } catch (error) {
    console.error("[API] /integrations/link error:", error);
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
