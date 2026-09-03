import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Promocodes } from "@/lib/supabase/queries/promocodes";
import { resolveGraceForUserAfterTopup } from "@/lib/billing/grace/recovery";
import { limitByUser } from "@/lib/cooldown/userbased";

// POST: Redeem a coupon code
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Promo code is required" },
        { status: 400 }
      );
    }

    const result = await Promocodes.redeem(
      code.toUpperCase().trim(),
      user.id,
      user.email
    );

    if (!result.success) {
      return NextResponse.json(
        { message: result.error || "Failed to redeem coupon" },
        { status: 400 }
      );
    }

    // The ledger row is written inside billing_redeem_promocode_atomic now,
    // in the same transaction as the credit. It used to be written here, in a
    // try/catch that logged and continued because "credits are already added"
    // — which is how the 2026-08 audit found $110 of coupon credit sitting in
    // a balance with nothing explaining it. There is nothing to do here.

    try {
      await resolveGraceForUserAfterTopup({ userId: user.id });
    } catch (graceErr) {
      console.warn("[Coupons] Grace recovery hook failed:", graceErr);
    }

    return NextResponse.json({
      success: true,
      balance: result.balance,
      amount: result.amount,
      message: `Successfully added $${result.amount} to your balance!`,
    });
  } catch (error: unknown) {
    console.error("[User Coupons] Error redeeming coupon:", error);
    return NextResponse.json(
      { error: "Failed to redeem coupon" },
      { status: 500 }
    );
  }
}
