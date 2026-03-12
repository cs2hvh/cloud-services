import { NextResponse } from "next/server";

// DEPRECATED: Direct top-ups are no longer supported.
// Credits are now added via Stripe webhook after successful payment.
// See: /api/billing/create-checkout-session and /api/billing/webhook

export async function POST() {
  return NextResponse.json(
    { error: "Direct top-ups are disabled. Please use the billing page to add funds via Stripe." },
    { status: 410 }
  );
}
