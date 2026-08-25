/**
 * Admin API - Platform AI Models Management
 * GET /api/admin/ai-agents/models - List all platform models
 * POST /api/admin/ai-agents/models - Create a new model
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { PlatformModels } from "@/lib/supabase/queries/ai_agents";
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

// Validation schema for creating/updating models
const modelSchema = z.object({
  // Price is deliberately NOT accepted here. It lives in inference.models.pricing,
  // which is what the whole platform bills at, and is resolved at read time
  // (withPlatformPricing). Accepting it here would put a second, editable copy
  // of the price next to the real one — which is how this table ended up
  // holding our upstream cost and billing customers at it.
  //
  // To offer a model: add it to inference.models with its price, then register
  // it here as part of the catalogue. A model with no price there is withheld.
  model_id: z.string().min(1, "Model ID is required"),
  display_name: z.string().min(1, "Display name is required"),
  provider: z.string().min(1, "Provider is required"),
  description: z.string().optional(),
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

    // Existence, not price: get_by_model_id withholds unpriced models, so it
    // would report an existing row as absent and we would insert a duplicate.
    const existing = await PlatformModels.exists_in_catalogue(validation.data.model_id);
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
