/**
 * Admin API - Single Platform Model Management
 * GET /api/admin/ai-agents/models/[id] - Get a specific model
 * PUT /api/admin/ai-agents/models/[id] - Update a model
 * DELETE /api/admin/ai-agents/models/[id] - Delete a model
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { PlatformModels } from "@/lib/supabase/queries/ai_agents";
import type { PlatformModelUpdate } from "@/lib/ai/types";
import { z } from "zod";

// Helper function to check if user is admin
async function checkAdminAuth() {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Get user profile to check roles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.roles?.includes("admin");

  return { authorized: isAdmin, user };
}

// Validation schema for updating models
const modelUpdateSchema = z.object({
  display_name: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  input_cost_per_million: z.number().min(0).optional(),
  output_cost_per_million: z.number().min(0).optional(),
  context_window: z.number().min(1000).optional(),
  supports_vision: z.boolean().optional(),
  supports_function_calling: z.boolean().optional(),
  supports_streaming: z.boolean().optional(),
  is_active: z.boolean().optional(),
  is_free: z.boolean().optional(),
  sort_order: z.number().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/ai-agents/models/[id]
 * Get a specific platform model
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const model = await PlatformModels.get(id);

    if (!model) {
      return NextResponse.json(
        { error: "Model not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: model,
    });
  } catch (error) {
    console.error("[Admin AI Models] Error getting model:", error);
    return NextResponse.json(
      { error: "Failed to fetch model" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/ai-agents/models/[id]
 * Update a platform model
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    // Check if model exists
    const existing = await PlatformModels.get(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Model not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const validation = modelUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.errors },
        { status: 400 }
      );
    }

    // Normalize nullable fields (e.g., description) to match expected types
    const updatePayload: PlatformModelUpdate = {
      ...validation.data,
      description: validation.data.description ?? undefined,
    };

    // Update model
    const result = await PlatformModels.update(id, updatePayload);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update model" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("[Admin AI Models] Error updating model:", error);
    return NextResponse.json(
      { error: "Failed to update model" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/ai-agents/models/[id]
 * Delete a platform model
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    // Check if model exists
    const existing = await PlatformModels.get(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Model not found" },
        { status: 404 }
      );
    }

    // Delete model
    const result = await PlatformModels.delete(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete model" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Model "${existing.model_id}" deleted successfully`,
    });
  } catch (error) {
    console.error("[Admin AI Models] Error deleting model:", error);
    return NextResponse.json(
      { error: "Failed to delete model" },
      { status: 500 }
    );
  }
}
