import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Promocodes } from "@/lib/supabase/queries";

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

// GET: Get all promocodes (admin only)
export async function GET() {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const coupons = await Promocodes.get_all();
    return NextResponse.json({ success: true, data: coupons });
  } catch (error: unknown) {
    console.error("[Admin Coupons] Error fetching coupons:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}

// POST: Create new promocode (admin only)
export async function POST(request: Request) {
  const { authorized, user } = await checkAdminAuth();

  if (!authorized || !user) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { code, amount, valid_till, coupon_type, max_redemptions } = body;

    // Validation
    if (!code || !amount || !valid_till || !coupon_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    const result = await Promocodes.create({
      code: code.toUpperCase().trim(),
      amount,
      valid_till,
      coupon_type,
      max_redemptions: max_redemptions || null,
      created_by: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create coupon" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    console.error("[Admin Coupons] Error creating coupon:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create coupon" },
      { status: 500 }
    );
  }
}

// PUT: Update promocode (admin only)
export async function PUT(request: Request) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { id, amount, valid_till, coupon_type, max_redemptions, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Coupon ID is required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = amount;
    if (valid_till !== undefined) updateData.valid_till = valid_till;
    if (coupon_type !== undefined) updateData.coupon_type = coupon_type;
    if (max_redemptions !== undefined) updateData.max_redemptions = max_redemptions;
    if (is_active !== undefined) updateData.is_active = is_active;

    const result = await Promocodes.update(id, updateData);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update coupon" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    console.error("[Admin Coupons] Error updating coupon:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update coupon" },
      { status: 500 }
    );
  }
}

// DELETE: Delete promocode (admin only, soft delete)
export async function DELETE(request: Request) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Coupon ID is required" },
        { status: 400 }
      );
    }

    const result = await Promocodes.delete(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete coupon" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[Admin Coupons] Error deleting coupon:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete coupon" },
      { status: 500 }
    );
  }
}
