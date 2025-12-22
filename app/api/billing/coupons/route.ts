import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Promocodes } from "@/lib/supabase/queries/promocodes";

// GET: Get available coupons for current user
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const coupons = await Promocodes.get_available_for_user(user.id, user.email);
    return NextResponse.json({ success: true, data: coupons });
  } catch (error: unknown) {
    console.error("[User Coupons] Error fetching available coupons:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}
