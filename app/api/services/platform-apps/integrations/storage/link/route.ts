/**
 * POST /api/services/platform-apps/integrations/storage/link
 * 
 * Link an object storage bucket to a platform app
 * 
 * Request Body:
 * {
 *   app_id: string (required) - The platform app UUID
 *   bucket_id: string (required) - The object_spaces UUID
 *   force?: boolean - Overwrite existing env vars (default: false)
 *   env_prefix?: string - Custom prefix for env vars (default: "S3")
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
import { ObjectStorageIntegrationService } from "@/lib/services/object-storage-integration";
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
      bucket_id?: string;
      force?: boolean;
      env_prefix?: string;
      env_configs?: Array<{ originalKey: string; customKey: string; value?: string }>;
      includeAwsVars?: boolean;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { app_id, bucket_id, force, env_prefix, env_configs, includeAwsVars } = body;

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

    // Validate env_prefix if provided
    if (env_prefix && !/^[A-Z][A-Z0-9_]*$/.test(env_prefix)) {
      return NextResponse.json(
        { success: false, error: "env_prefix must be uppercase with underscores only", code: "INVALID_PREFIX" },
        { status: 400 }
      );
    }

    // ========================================
    // Perform link operation
    // ========================================
    const result = await ObjectStorageIntegrationService.link({
      app_id,
      bucket_id,
      user_id: user.id,
      force: force === true,
      env_configs,
      env_prefix: env_prefix || "S3",
      includeAwsVars: includeAwsVars === true,
    });

    // Handle specific error codes
    if (!result.success) {
      const statusMap: Record<string, number> = {
        "APP_NOT_FOUND": 404,
        "BUCKET_NOT_FOUND": 404,
        "APP_NOT_OWNED": 403,
        "BUCKET_NOT_OWNED": 403,
        "PERMISSION_DENIED": 403,
        "BUCKET_NOT_READY": 400,
        "NO_CREDENTIALS": 400,
        "ALREADY_LINKED": 409,
        "ENV_VAR_CONFLICT": 409,
      };

      const status = statusMap[result.code || ""] || 500;

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          code: result.code,
          conflicts: result.conflicts,
        },
        { status }
      );
    }

    // Success response
    if (result.success && result.app_name && result.bucket_name) {
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
            bucket_linked: bucket_id,
            bucket_name: result.bucket_name,
            injected_vars: result.injected_vars 
          },
          metadata: { 
            operation: 'bucket_linked',
            redeploy_triggered: result.redeploy_triggered 
          },
          ...context,
        });
      } catch (auditErr) {
        console.error('[linkBucket] Failed to create audit log:', auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      integration_id: result.integration_id,
      injected_vars: result.injected_vars,
      redeploy_triggered: result.redeploy_triggered,
      message: `Bucket linked successfully. ${result.injected_vars?.length || 0} environment variables injected.`,
    });

  } catch (error) {
    console.error("[API] Storage link error:", error);
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
