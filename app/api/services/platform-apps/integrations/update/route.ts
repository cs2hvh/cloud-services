/**
 * PUT /api/services/platform-apps/integrations/update
 *
 * Update a database integration's env prefix or key mapping
 * without requiring unlink + re-link.
 *
 * Request Body:
 * {
 *   app_id: string (required)
 *   database_id: string (required)
 *   env_prefix?: string - New env var prefix (default: "DATABASE")
 *   env_mapping?: Record<string, string> - Custom key name mapping
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";

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
      database_id?: string;
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

    const { app_id, database_id, env_prefix, env_mapping } = body;

    if (!app_id || !database_id) {
      return NextResponse.json(
        { success: false, error: "app_id and database_id are required", code: "MISSING_FIELDS" },
        { status: 400 }
      );
    }

    if (!UUID_RE.test(app_id)) {
      return NextResponse.json(
        { success: false, error: "Invalid app_id format", code: "INVALID_APP_ID" },
        { status: 400 }
      );
    }

    // Perform update
    const result = await DatabaseIntegrationService.updateIntegration({
      app_id,
      database_id,
      user_id: user.id,
      env_prefix: env_prefix || "DATABASE",
      env_mapping: env_mapping || undefined,
    });

    if (!result.success) {
      const statusCode =
        result.code === "NOT_LINKED" ? 404 :
        result.code === "APP_NOT_FOUND" ? 404 :
        result.code === "DATABASE_NOT_FOUND" ? 404 :
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
    console.error("[integrations/update] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
