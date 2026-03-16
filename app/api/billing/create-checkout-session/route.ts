import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { Billing } from "@/lib/supabase/queries/billing";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

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
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}` },
        { status: 400 }
      );
    }

    // Get or create Stripe Customer
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
    // Validate origin to prevent open redirect
    const baseUrl = origin && new URL(allowedDomain).origin === origin ? origin : allowedDomain;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      payment_intent_data: {
        description: `AhuraSense Cloud Services - Account Top-Up ($${amount.toFixed(2)})`,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Account balance top-up of $${amount.toFixed(2)}`,
          footer: "Thank you for choosing AhuraSense Cloud Services.",
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100), // Stripe uses cents
            product_data: {
              name: "AhuraSense Cloud Services — Account Top-Up",
              description: `Add $${amount.toFixed(2)} credit to your AhuraSense Cloud account balance. Credits are used for cloud compute, storage, databases, and other services.`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        amount: String(amount),
      },
      success_url: `${baseUrl}/dashboard/nav/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/nav/billing?status=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("[Stripe] create-checkout-session error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
