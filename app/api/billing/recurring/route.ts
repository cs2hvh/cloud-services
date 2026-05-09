import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { Billing } from "@/lib/supabase/queries/billing";

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

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recurring = await Billing.get_recurring_topup(user.id);
    return NextResponse.json({ success: true, data: recurring });
  } catch (error: unknown) {
    console.error("[Billing Recurring] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch recurring billing" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body.action || "").toLowerCase();

    if (action !== "cancel") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const recurring = await Billing.get_recurring_topup(user.id);
    if (!recurring || !recurring.stripe_subscription_id) {
      return NextResponse.json({ error: "No active recurring subscription found" }, { status: 404 });
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.update(recurring.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await Billing.update_recurring_topup_by_user({
      userId: user.id,
      stripeSubscriptionId: subscription.id,
      status: mapSubscriptionStatus(subscription.status),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : recurring.canceled_at,
    });

    return NextResponse.json({
      success: true,
      message: "Recurring top-up will be canceled at period end",
      data: {
        status: mapSubscriptionStatus(subscription.status),
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
    });
  } catch (error: unknown) {
    console.error("[Billing Recurring] POST error:", error);
    return NextResponse.json({ error: "Failed to update recurring billing" }, { status: 500 });
  }
}
