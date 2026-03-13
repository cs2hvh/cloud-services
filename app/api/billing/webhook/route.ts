import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { Billing } from "@/lib/supabase/queries/billing";
import Stripe from "stripe";

// Disable Next.js body parsing — we need the raw body for signature verification
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    // Read raw body as text for signature verification
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    console.error("[Stripe Webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const amount = parseFloat(session.metadata?.amount ?? "0");

      if (!userId || !amount || amount <= 0) {
        console.error("[Stripe Webhook] Invalid metadata in session:", session.id);
        // Still return 200 to acknowledge receipt
        return NextResponse.json({ received: true });
      }

      // Idempotency check — don't credit twice
      const existing = await Billing.get_transaction_by_session(session.id);
      if (existing?.status === "completed") {
        console.log("[Stripe Webhook] Already processed session:", session.id);
        return NextResponse.json({ received: true });
      }

      try {
        // Credit the user's balance
        const topupResult = await Billing.topup(userId, amount);

        // Record the transaction
        await Billing.save_transaction({
          userId,
          stripeSessionId: session.id,
          stripePaymentIntent: typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
          amount,
          status: "completed",
          type: "topup",
          balanceAfter: topupResult.credit_balance,
        });

        console.log(`[Stripe Webhook] Credited $${amount} to user ${userId} (session: ${session.id})`);
      } catch (err: unknown) {
        console.error("[Stripe Webhook] Failed to process payment:", err);
        // Return 500 so Stripe retries
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
      }
      break;
    }
    default:
      // Acknowledge unknown event types
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
