import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  createPromoSchema,
  updatePromoSchema,
  deletePromoSchema,
} from "@/lib/validation/pricing";
import { validateRequest } from "@/lib/middleware/validate-request";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

// GET - Fetch all pricing promos
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
    const { data: promos, error } = await supabase
      .from("pricing_promos")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { promos, count: promos?.length || 0 },
      { status: 200 }
    );
  } catch (error) {
    logError("GET /api/admin/pricing/promos", error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// POST - Create a new pricing promo
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

    const validation = validateRequest(createPromoSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("pricing_promos")
      .insert(validatedData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { promo: data, message: "Promo created successfully" },
      { status: 201 }
    );
  } catch (error) {
    logError("POST /api/admin/pricing/promos", error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// PUT - Update an existing pricing promo
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

    const validation = validateRequest(updatePromoSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { id, ...updateData } = validation.data;
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("pricing_promos")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: "Promo not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { promo: data, message: "Promo updated successfully" },
      { status: 200 }
    );
  } catch (error) {
    logError("PUT /api/admin/pricing/promos", error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// DELETE - Delete a pricing promo
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

    const validation = validateRequest(deletePromoSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { id } = validation.data;
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from("pricing_promos")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { message: "Promo deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    logError("DELETE /api/admin/pricing/promos", error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
