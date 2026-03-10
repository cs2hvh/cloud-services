import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Promocodes } from "@/lib/supabase/queries/promocodes";
import { Billing } from "@/lib/supabase/queries/billing";
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
      prefix: "rl:bucket-create",
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

    // Record coupon redemption as a transaction
    try {
      await Billing.save_transaction({
        userId: user.id,
        amount: result.amount!,
        status: "completed",
        type: "coupon",
        balanceAfter: result.balance,
        description: code.toUpperCase().trim(),
      });
    } catch (txnErr) {
      console.error("[Coupons] Failed to save coupon transaction:", txnErr);
      // Don't fail the redemption — credits are already added
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
      {
        error:
          error instanceof Error ? error.message : "Failed to redeem coupon",
      },
      { status: 500 }
    );
  }
}
