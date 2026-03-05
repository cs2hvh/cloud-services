import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
} from "@/lib/validation/pricing";
import { validateRequest } from "@/lib/middleware/validate-request";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}

// GET - Fetch all pricing categories
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const supabase = await createServiceClient();
    const { data: categories, error } = await supabase
      .from("pricing_categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { categories, count: categories?.length || 0 },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Pricing Categories API] GET error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST - Create a new pricing category
export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const validation = validateRequest(createCategorySchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;
    const supabase = await createServiceClient();

    // Check if category with same slug already exists
    const { data: existing } = await supabase
      .from("pricing_categories")
      .select("id")
      .eq("slug", validatedData.slug)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Category with this slug already exists" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("pricing_categories")
      .insert(validatedData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { category: data, message: "Category created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Pricing Categories API] POST error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to create category" },
      { status: 500 }
    );
  }
}

// PUT - Update an existing pricing category
export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const validation = validateRequest(updateCategorySchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { id, ...updateData } = validation.data;
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("pricing_categories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { category: data, message: "Category updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Pricing Categories API] PUT error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to update category" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a pricing category
export async function DELETE(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const validation = validateRequest(deleteCategorySchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { id } = validation.data;
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from("pricing_categories")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { message: "Category deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Pricing Categories API] DELETE error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to delete category" },
      { status: 500 }
    );
  }
}
