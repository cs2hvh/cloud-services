import { NextRequest, NextResponse } from "next/server";
import { Products } from "@/lib/supabase/queries/products";
import { requireAdmin } from "@/lib/supabase/auth";
import {
  createProductSchema,
  updateProductSchema,
  deleteProductSchema,
} from "@/lib/validation/products";
import { validateRequest } from "@/lib/middleware/validate-request";

// Error handler utility
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}

// GET - Fetch all products or filter by type
export async function GET(req: NextRequest) {
  // Check admin authentication
  // const adminCheck = await requireAdmin();
  // if (!adminCheck.ok) {
  //   return NextResponse.json(
  //     { error: "Unauthorized - Admin access required" },
  //     { status: 401 }
  //   );
  // }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    let products;
    if (type) {
      products = await Products.get_by_type(type);
    } else {
      products = await Products.get_all();
    }

    return NextResponse.json(
      { products, count: products.length },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Products API] GET error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// POST - Create a new product
export async function POST(req: NextRequest) {
  // Check admin authentication
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    // Validate request body
    const validation = validateRequest(createProductSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // Create product
    const result = await Products.create(validatedData);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create product" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { product: result.data, message: "Product created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Products API] POST error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to create product" },
      { status: 500 }
    );
  }
}

// PUT - Update an existing product
export async function PUT(req: NextRequest) {
  // Check admin authentication
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    // Validate request body
    const validation = validateRequest(updateProductSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;
    const { id, ...updateData } = validatedData;

    // Check if product exists
    const existingProduct = await Products.get_by_id(id);
    if (!existingProduct) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Update product
    const result = await Products.update(id, updateData);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update product" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { product: result.data, message: "Product updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Products API] PUT error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to update product" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a product
export async function DELETE(req: NextRequest) {
  // Check admin authentication
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    // Validate request body
    const validation = validateRequest(deleteProductSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { id } = validation.data;

    // Check if product exists
    const existingProduct = await Products.get_by_id(id);
    if (!existingProduct) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Check if product is in use
    const usage = await Products.check_usage(id);
    if (usage.inUse) {
      return NextResponse.json(
        {
          error: `Cannot delete product. It is currently used by ${usage.count} database cluster(s)`,
          inUse: true,
          count: usage.count,
        },
        { status: 400 }
      );
    }

    // Delete product
    const result = await Products.delete(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete product" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Product deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Products API] DELETE error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to delete product" },
      { status: 500 }
    );
  }
}
