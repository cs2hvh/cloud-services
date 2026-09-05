/**
 * Admin API - Platform AI Models Management
 * GET /api/admin/ai-agents/models - List all platform models
 * POST /api/admin/ai-agents/models - Create a new model
 */

import { NextRequest, NextResponse } from "next/server";
import { PlatformModels } from "@/lib/supabase/queries/ai_agents";
import { z } from "zod";
import { checkAdminAuth } from "@/lib/auth/check-admin";

// Admission is the shared policy in lib/auth/check-admin (requireAdmin:
// ADMIN_EMAILS when set, otherwise user_profiles.roles, plus the second-factor
// and suspension checks). This file used to run its own roles-only query,
// which ignored ADMIN_EMAILS and both of those checks.

// Validation schema for creating/updating models
const modelSchema = z.object({
  model_id: z.string().min(1, "Model ID is required"),
  display_name: z.string().min(1, "Display name is required"),
  provider: z.string().min(1, "Provider is required"),
  description: z.string().optional(),
  input_cost_per_million: z.number().min(0, "Input cost must be non-negative"),
  output_cost_per_million: z.number().min(0, "Output cost must be non-negative"),
  context_window: z.number().min(1000).default(128000),
  supports_vision: z.boolean().default(false),
  supports_function_calling: z.boolean().default(false),
  supports_streaming: z.boolean().default(true),
  is_active: z.boolean().default(true),
  is_free: z.boolean().default(false),
  sort_order: z.number().default(100),
});

/**
 * GET /api/admin/ai-agents/models
 * List all platform models (including inactive)
 */
export async function GET() {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const models = await PlatformModels.list_all();
    
    return NextResponse.json({
      success: true,
      data: models,
    });
  } catch (error) {
    console.error("[Admin AI Models] Error listing models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ai-agents/models
 * Create a new platform model
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    
    // Validate input
    const validation = modelSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.errors },
        { status: 400 }
      );
    }

    // Check if model_id already exists
    const existing = await PlatformModels.get_by_model_id(validation.data.model_id);
    if (existing) {
      return NextResponse.json(
        { error: `Model "${validation.data.model_id}" already exists` },
        { status: 409 }
      );
    }

    // Create model
    const result = await PlatformModels.create(validation.data);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create model" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    }, { status: 201 });
  } catch (error) {
    console.error("[Admin AI Models] Error creating model:", error);
    return NextResponse.json(
      { error: "Failed to create model" },
      { status: 500 }
    );
  }
}
