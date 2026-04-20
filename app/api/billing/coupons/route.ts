import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Promocodes } from "@/lib/supabase/queries/promocodes";
import { limitByUser } from "@/lib/cooldown/userbased";

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

     const rl = await limitByUser(user.id, {
          prefix: "rl:coupon-redeem",
          limit: 3,
          windowMs: 60_000,
        });
        if (!rl.allowed) {
          return NextResponse.json(
            {
              error: "Too Many Requests",
              message: `Retry after ${rl.retryAfterSec}s`,
            },
            { status: 429 }
          );
        }

    const coupons = await Promocodes.get_available_for_user(user.id, user.email);
    return NextResponse.json({ success: true, data: coupons });
  } catch (error: unknown) {
    console.error("[User Coupons] Error fetching available coupons:", error);
    return NextResponse.json(
      { error: "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}
