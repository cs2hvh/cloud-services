import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { Billing } from "@/lib/supabase/queries/billing";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;
const ALLOWED_INTERVALS = new Set(["week", "month", "year"]);

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const amount = Number(body.amount);
    const interval = String(body.interval || "").toLowerCase();

    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}` },
        { status: 400 }
      );
    }

    if (!ALLOWED_INTERVALS.has(interval)) {
      return NextResponse.json(
        { error: "Interval must be one of: week, month, year" },
        { status: 400 }
      );
    }

    let stripeCustomerId = await Billing.get_stripe_customer_id(user.id);
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await Billing.save_stripe_customer_id(user.id, stripeCustomerId);
    }

    const origin = request.headers.get("origin") || "";
    const allowedDomain = process.env.DOMAIN || "http://localhost:3000";
    const baseUrl = origin && new URL(allowedDomain).origin === origin ? origin : allowedDomain;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            recurring: {
              interval: interval as "week" | "month" | "year",
            },
            product_data: {
              name: "AhuraSense Cloud Services - Auto Top-up",
              description: `Automatically add $${amount.toFixed(2)} to your account every ${interval}.`,
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          user_id: user.id,
          amount: String(amount),
          interval,
        },
      },
      metadata: {
        user_id: user.id,
        amount: String(amount),
        interval,
        recurring_topup: "true",
      },
      success_url: `${baseUrl}/dashboard/nav/billing?status=recurring_success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/nav/billing?status=recurring_cancelled`,
    });

    const stripeSubscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    await Billing.upsert_recurring_topup({
      userId: user.id,
      amount,
      interval: interval as "week" | "month" | "year",
      currency: "usd",
      status: "pending",
      stripeSubscriptionId,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("[Stripe] recurring create-checkout-session error:", error);
    return NextResponse.json(
      { error: "Failed to create recurring checkout session" },
      { status: 500 }
    );
  }
}
