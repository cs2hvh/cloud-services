import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { Billing } from "@/lib/supabase/queries/billing";
import { createServiceClient } from "@/lib/supabase/server";
import { NotificationService } from "@/lib/notifications";
import { emailService } from "@/lib/email";
import Stripe from "stripe";

// Disable Next.js body parsing - we need the raw body for signature verification
export const dynamic = "force-dynamic";

type RecurringStatus =
  | "pending"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "trialing"
  | "paused";

type BillingCreditKind = "topup" | "recurring";

type BillingWithClaims = typeof Billing & {
  claim_session_transaction?: (params: {
    userId: string;
    stripeSessionId: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    stripePaymentIntent?: string;
    description?: string;
  }) => Promise<boolean>;
  claim_invoice_transaction?: (params: {
    userId: string;
    stripeInvoiceId: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    stripePaymentIntent?: string;
    description?: string;
  }) => Promise<boolean>;
  mark_session_transaction_completed?: (params: {
    stripeSessionId: string;
    stripePaymentIntent?: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    balanceAfter?: number;
    description?: string;
    receiptUrl?: string;
  }) => Promise<void>;
  mark_invoice_transaction_completed?: (params: {
    stripeInvoiceId: string;
    stripePaymentIntent?: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    balanceAfter?: number;
    description?: string;
    receiptUrl?: string;
  }) => Promise<void>;
  mark_session_transaction_failed?: (stripeSessionId: string, description?: string) => Promise<void>;
  mark_invoice_transaction_failed?: (stripeInvoiceId: string, description?: string) => Promise<void>;
};

const mapSubscriptionStatus = (status: Stripe.Subscription.Status): RecurringStatus => {
  if (status === "active") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "incomplete") return "incomplete";
  if (status === "incomplete_expired") return "incomplete_expired";
  if (status === "unpaid") return "unpaid";
  if (status === "trialing") return "trialing";
  if (status === "paused") return "paused";
  return "pending";
};

const formatAmount = (amount: number, currency: string) => {
  const normalizedCurrency = (currency || "usd").toUpperCase();
  if (normalizedCurrency === "USD") {
    return `$${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${normalizedCurrency}`;
};

async function sendBillingCreditUserUpdates(params: {
  userId: string;
  amount: number;
  currency: string;
  referenceId: string;
  kind: BillingCreditKind;
  receiptUrl?: string;
}) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return;
    }

    const supabase = await createServiceClient();
    const { data: authData, error: userErr } = await supabase.auth.admin.getUserById(params.userId);

    if (userErr || !authData?.user) {
      console.warn("[Stripe Webhook] Could not fetch user for billing notifications:", userErr?.message);
      return;
    }

    const user = authData.user;
    const userEmail = user.email;
    const userName =
      (typeof user.user_metadata?.username === "string" && user.user_metadata.username) ||
      (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
      (userEmail ? userEmail.split("@")[0] : "there");

    const amountLabel = formatAmount(params.amount, params.currency);
    const isRecurring = params.kind === "recurring";
    const title = isRecurring ? "Recurring Top-up Successful" : "Balance Top-up Successful";
    const message = isRecurring
      ? `Your recurring payment has added ${amountLabel} to your account balance.`
      : `Your account has been topped up with ${amountLabel}.`;

    const notificationResult = await NotificationService.create({
      user_id: params.userId,
      type: "success",
      title,
      message,
      service_type: "billing",
      action: "updated",
      metadata: {
        updateType: "billing_credit",
        amount: params.amount,
        currency: params.currency,
        kind: params.kind,
        referenceId: params.referenceId,
        receiptUrl: params.receiptUrl,
      },
    });

    if (!notificationResult.success) {
      console.warn("[Stripe Webhook] Failed to create billing notification:", notificationResult.error);
    }

    if (!userEmail) {
      return;
    }

    const emailResult = await emailService.sendTemplate({
      template: "billingNotification",
      to: userEmail,
      data: {
        customerName: userName,
        invoiceNumber: params.referenceId,
        amount: amountLabel,
        dueDate: new Date().toLocaleDateString("en-US"),
        status: "paid",
        actionUrl: params.receiptUrl,
        actionLabel: params.receiptUrl ? "View receipt" : "View billing",
        notes: isRecurring
          ? "This top-up was processed as part of your recurring billing setup."
          : "This top-up was processed successfully via Stripe Checkout.",
      },
      tags: [
        { name: "source", value: "stripe-webhook" },
        { name: "billing-kind", value: params.kind },
      ],
    });

    if (!emailResult.success) {
      console.warn("[Stripe Webhook] Failed to send billing email:", emailResult.error ?? emailResult.message);
    }
  } catch (err: unknown) {
    console.warn("[Stripe Webhook] Billing side notifications failed:", err);
  }
}

async function claimSessionTransaction(params: {
  userId: string;
  stripeSessionId: string;
  amount: number;
  currency?: string;
  type?: "topup" | "refund" | "coupon" | "recurring";
  stripePaymentIntent?: string;
  description?: string;
}): Promise<boolean> {
  const billing = Billing as BillingWithClaims;
  if (typeof billing.claim_session_transaction === "function") {
    return billing.claim_session_transaction(params);
  }
  const existing = await Billing.get_transaction_by_session(params.stripeSessionId);
  return existing?.status !== "completed";
}

async function claimInvoiceTransaction(params: {
  userId: string;
  stripeInvoiceId: string;
  amount: number;
  currency?: string;
  type?: "topup" | "refund" | "coupon" | "recurring";
  stripePaymentIntent?: string;
  description?: string;
}): Promise<boolean> {
  const billing = Billing as BillingWithClaims;
  if (typeof billing.claim_invoice_transaction === "function") {
    return billing.claim_invoice_transaction(params);
  }
  const existing = await Billing.get_transaction_by_invoice(params.stripeInvoiceId);
  return existing?.status !== "completed";
}

async function completeSessionTransaction(params: {
  userId: string;
  stripeSessionId: string;
  stripePaymentIntent?: string;
  amount: number;
  currency?: string;
  type?: "topup" | "refund" | "coupon" | "recurring";
  balanceAfter?: number;
  description?: string;
  receiptUrl?: string;
}): Promise<void> {
  const billing = Billing as BillingWithClaims;
  if (typeof billing.mark_session_transaction_completed === "function") {
    await billing.mark_session_transaction_completed({
      stripeSessionId: params.stripeSessionId,
      stripePaymentIntent: params.stripePaymentIntent,
      amount: params.amount,
      currency: params.currency,
      type: params.type,
      balanceAfter: params.balanceAfter,
      description: params.description,
      receiptUrl: params.receiptUrl,
    });
    return;
  }

  await Billing.save_transaction({
    userId: params.userId,
    stripeSessionId: params.stripeSessionId,
    stripePaymentIntent: params.stripePaymentIntent,
    amount: params.amount,
    currency: params.currency,
    status: "completed",
    type: params.type,
    balanceAfter: params.balanceAfter,
    description: params.description,
    receiptUrl: params.receiptUrl,
  });
}

async function completeInvoiceTransaction(params: {
  userId: string;
  stripeInvoiceId: string;
  stripePaymentIntent?: string;
  amount: number;
  currency?: string;
  type?: "topup" | "refund" | "coupon" | "recurring";
  balanceAfter?: number;
  description?: string;
  receiptUrl?: string;
}): Promise<void> {
  const billing = Billing as BillingWithClaims;
  if (typeof billing.mark_invoice_transaction_completed === "function") {
    await billing.mark_invoice_transaction_completed({
      stripeInvoiceId: params.stripeInvoiceId,
      stripePaymentIntent: params.stripePaymentIntent,
      amount: params.amount,
      currency: params.currency,
      type: params.type,
      balanceAfter: params.balanceAfter,
      description: params.description,
      receiptUrl: params.receiptUrl,
    });
    return;
  }

  await Billing.save_transaction({
    userId: params.userId,
    stripeInvoiceId: params.stripeInvoiceId,
    stripePaymentIntent: params.stripePaymentIntent,
    amount: params.amount,
    currency: params.currency,
    status: "completed",
    type: params.type,
    balanceAfter: params.balanceAfter,
    description: params.description,
    receiptUrl: params.receiptUrl,
  });
}

async function markSessionTransactionFailed(stripeSessionId: string, description?: string): Promise<void> {
  const billing = Billing as BillingWithClaims;
  if (typeof billing.mark_session_transaction_failed === "function") {
    await billing.mark_session_transaction_failed(stripeSessionId, description);
  }
}

async function markInvoiceTransactionFailed(stripeInvoiceId: string, description?: string): Promise<void> {
  const billing = Billing as BillingWithClaims;
  if (typeof billing.mark_invoice_transaction_failed === "function") {
    await billing.mark_invoice_transaction_failed(stripeInvoiceId, description);
  }
}

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
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    console.error("[Stripe Webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripe = getStripeClient();

      if (session.mode === "subscription") {
        const userId = session.metadata?.user_id;
        const amount = parseFloat(session.metadata?.amount ?? "0");
        const safeAmount = amount > 0 ? amount : session.amount_total ? session.amount_total / 100 : 0;
        const intervalRaw = String(session.metadata?.interval ?? "").toLowerCase();
        const interval = (["week", "month", "year"].includes(intervalRaw)
          ? intervalRaw
          : "month") as "week" | "month" | "year";
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        if (!userId) {
          console.error("[Stripe Webhook] Missing user metadata for subscription checkout:", session.id);
          return NextResponse.json({ received: true });
        }
        if (!safeAmount || safeAmount <= 0) {
          console.warn("[Stripe Webhook] Missing recurring amount for subscription checkout:", session.id);
          return NextResponse.json({ received: true });
        }

        let status: RecurringStatus = "pending";
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            status = mapSubscriptionStatus(subscription.status);
          } catch (subscriptionErr) {
            console.warn("[Stripe Webhook] Could not retrieve subscription status:", subscriptionErr);
          }
        }

        await Billing.upsert_recurring_topup({
          userId,
          amount: safeAmount,
          interval,
          currency: (session.currency || "usd").toLowerCase(),
          status,
          stripeSubscriptionId: subscriptionId,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        });

        console.log(`[Stripe Webhook] Registered recurring checkout for user ${userId} (session: ${session.id})`);
        break;
      }

      const userId = session.metadata?.user_id;
      const metadataAmount = parseFloat(session.metadata?.amount ?? "0");
      const actualAmountCents = session.amount_total;
      const amount = actualAmountCents ? actualAmountCents / 100 : metadataAmount;

      if (!userId || !amount || amount <= 0) {
        console.error("[Stripe Webhook] Invalid metadata in session:", session.id);
        return NextResponse.json({ received: true });
      }

      const existing = await Billing.get_transaction_by_session(session.id);
      if (existing?.status === "completed") {
        console.log("[Stripe Webhook] Already processed session:", session.id);
        return NextResponse.json({ received: true });
      }

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      const currency = (session.currency || "usd").toLowerCase();

      const claimed = await claimSessionTransaction({
        userId,
        stripeSessionId: session.id,
        stripePaymentIntent: paymentIntentId,
        amount,
        currency,
        type: "topup",
        description: "Stripe checkout session received",
      });
      if (!claimed) {
        console.log("[Stripe Webhook] Session is already processing or processed:", session.id);
        return NextResponse.json({ received: true });
      }

      let topupResult: { credit_balance: number } | null = null;
      let receiptUrl: string | undefined;
      try {
        topupResult = await Billing.topup(userId, amount);

        if (paymentIntentId) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            const chargeId =
              typeof paymentIntent.latest_charge === "string"
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

        if (!receiptUrl && session.invoice) {
          try {
            const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id;
            if (invoiceId) {
              const invoice = await stripe.invoices.retrieve(invoiceId);
              receiptUrl = invoice.hosted_invoice_url ?? undefined;
            }
          } catch (invoiceErr) {
            console.warn("[Stripe Webhook] Could not retrieve invoice URL:", invoiceErr);
          }
        }

        await completeSessionTransaction({
          userId,
          stripeSessionId: session.id,
          stripePaymentIntent: paymentIntentId,
          amount,
          currency,
          type: "topup",
          balanceAfter: topupResult.credit_balance,
          receiptUrl,
        });

        await sendBillingCreditUserUpdates({
          userId,
          amount,
          currency,
          referenceId: session.id,
          kind: "topup",
          receiptUrl,
        });

        console.log(`[Stripe Webhook] Credited $${amount} to user ${userId} (session: ${session.id})`);
      } catch (err: unknown) {
        console.error("[Stripe Webhook] Failed to process payment:", err);
        if (!topupResult) {
          await markSessionTransactionFailed(
            session.id,
            err instanceof Error ? err.message : "Processing failed"
          );
          return NextResponse.json({ error: "Processing failed" }, { status: 500 });
        }
        // Credit is already applied. Avoid retries that could lead to duplicate top-ups.
        return NextResponse.json({ received: true });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeInvoiceId = invoice.id;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof subscriptionRef === "string"
          ? subscriptionRef
          : subscriptionRef?.id ?? null;

      if (!subscriptionId) {
        break;
      }

      const existing = await Billing.get_transaction_by_invoice(stripeInvoiceId);
      if (existing?.status === "completed") {
        console.log("[Stripe Webhook] Already processed invoice:", stripeInvoiceId);
        return NextResponse.json({ received: true });
      }

      let recurringTopupApplied = false;
      try {
        const stripe = getStripeClient();
        let recurring = await Billing.get_recurring_topup_by_subscription(subscriptionId);

        if (!recurring) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const inferredUserId = subscription.metadata?.user_id;
          const inferredIntervalRaw = String(subscription.metadata?.interval ?? "").toLowerCase();
          const inferredInterval = (["week", "month", "year"].includes(inferredIntervalRaw)
            ? inferredIntervalRaw
            : "month") as "week" | "month" | "year";
          const inferredAmount = parseFloat(subscription.metadata?.amount ?? "0");
          const configuredAmount = inferredAmount > 0 ? inferredAmount : invoice.amount_paid / 100;

          if (!inferredUserId) {
            console.error("[Stripe Webhook] Unable to infer user for recurring invoice:", stripeInvoiceId);
            break;
          }
          if (!configuredAmount || configuredAmount <= 0) {
            console.warn("[Stripe Webhook] Missing recurring amount for invoice:", stripeInvoiceId);
            break;
          }

          await Billing.upsert_recurring_topup({
            userId: inferredUserId,
            amount: configuredAmount,
            interval: inferredInterval,
            currency: (invoice.currency || "usd").toLowerCase(),
            status: mapSubscriptionStatus(subscription.status),
            stripeSubscriptionId: subscription.id,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : null,
          });

          recurring = await Billing.get_recurring_topup_by_subscription(subscription.id);
        }

        if (!recurring?.user_id) {
          console.error("[Stripe Webhook] Recurring record missing user for invoice:", stripeInvoiceId);
          break;
        }

        const amount = invoice.amount_paid ? invoice.amount_paid / 100 : 0;
        if (!amount || amount <= 0) {
          break;
        }

        const paymentIntentRef = invoice.payments?.data?.[0]?.payment?.payment_intent;
        const paymentIntentId =
          typeof paymentIntentRef === "string"
            ? paymentIntentRef
            : paymentIntentRef?.id;
        const currency = (invoice.currency || "usd").toLowerCase();
        const claimed = await claimInvoiceTransaction({
          userId: recurring.user_id,
          stripeInvoiceId,
          stripePaymentIntent: paymentIntentId,
          amount,
          currency,
          type: "recurring",
          description: "Recurring invoice payment received",
        });
        if (!claimed) {
          console.log("[Stripe Webhook] Invoice is already processing or processed:", stripeInvoiceId);
          return NextResponse.json({ received: true });
        }

        let topupResult: { credit_balance: number } | null = null;
        topupResult = await Billing.topup(recurring.user_id, amount);
        recurringTopupApplied = true;

        await completeInvoiceTransaction({
          userId: recurring.user_id,
          stripeInvoiceId,
          stripePaymentIntent: paymentIntentId,
          amount,
          currency,
          type: "recurring",
          balanceAfter: topupResult.credit_balance,
          receiptUrl: invoice.hosted_invoice_url ?? undefined,
        });

        await sendBillingCreditUserUpdates({
          userId: recurring.user_id,
          amount,
          currency,
          referenceId: stripeInvoiceId,
          kind: "recurring",
          receiptUrl: invoice.hosted_invoice_url ?? undefined,
        });

        console.log(
          `[Stripe Webhook] Credited recurring $${amount} to user ${recurring.user_id} (invoice: ${stripeInvoiceId})`
        );
      } catch (err: unknown) {
        console.error("[Stripe Webhook] Failed to process recurring invoice:", err);
        if (recurringTopupApplied) {
          // Credit is already applied. Avoid retries that could lead to duplicate top-ups.
          return NextResponse.json({ received: true });
        }
        await markInvoiceTransactionFailed(
          stripeInvoiceId,
          err instanceof Error ? err.message : "Recurring processing failed"
        );
        return NextResponse.json({ error: "Recurring processing failed" }, { status: 500 });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof subscriptionRef === "string"
          ? subscriptionRef
          : subscriptionRef?.id ?? null;
      if (subscriptionId) {
        try {
          await Billing.update_recurring_topup_status_by_subscription({
            stripeSubscriptionId: subscriptionId,
            status: "past_due",
          });
        } catch (err: unknown) {
          console.warn("[Stripe Webhook] Failed to mark recurring subscription as past_due:", err);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      try {
        await Billing.update_recurring_topup_status_by_subscription({
          stripeSubscriptionId: subscription.id,
          status: mapSubscriptionStatus(subscription.status),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : null,
        });
      } catch (err: unknown) {
        console.warn("[Stripe Webhook] Failed to update subscription status:", err);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      try {
        await Billing.update_recurring_topup_status_by_subscription({
          stripeSubscriptionId: subscription.id,
          status: "canceled",
          cancelAtPeriodEnd: true,
          canceledAt: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : new Date().toISOString(),
        });
      } catch (err: unknown) {
        console.warn("[Stripe Webhook] Failed to mark subscription deleted:", err);
      }
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
