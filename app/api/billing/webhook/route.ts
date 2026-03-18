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
      const metadataAmount = parseFloat(session.metadata?.amount ?? "0");

      // Use the actual amount Stripe charged (in cents), NOT metadata — prevents price tampering
      const actualAmountCents = session.amount_total;
      const amount = actualAmountCents ? actualAmountCents / 100 : metadataAmount;

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
        const stripe = getStripeClient();
        // Credit the user's balance
        const topupResult = await Billing.topup(userId, amount);

        // Retrieve receipt URL from Stripe
        let receiptUrl: string | undefined;
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

        if (paymentIntentId) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            const chargeId = typeof paymentIntent.latest_charge === "string"
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge?.id;
            if (chargeId) {
              const charge = await stripe.charges.retrieve(chargeId);
              receiptUrl = charge.receipt_url ?? undefined;
            }
          } catch (receiptErr) {
            console.warn("[Stripe Webhook] Could not retrieve receipt URL:", receiptErr);
          }
        }

        // Check if an invoice was created (via invoice_creation on checkout)
        if (!receiptUrl && session.invoice) {
          try {
            const invoiceId = typeof session.invoice === "string"
              ? session.invoice
              : session.invoice?.id;
            if (invoiceId) {
              const invoice = await stripe.invoices.retrieve(invoiceId);
              receiptUrl = invoice.hosted_invoice_url ?? undefined;
            }
          } catch (invoiceErr) {
            console.warn("[Stripe Webhook] Could not retrieve invoice URL:", invoiceErr);
          }
        }

        // Record the transaction
        await Billing.save_transaction({
          userId,
          stripeSessionId: session.id,
          stripePaymentIntent: paymentIntentId,
          amount,
          status: "completed",
          type: "topup",
          balanceAfter: topupResult.credit_balance,
          receiptUrl,
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
