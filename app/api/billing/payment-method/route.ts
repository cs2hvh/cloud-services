import { NextResponse } from "next/server";

// DEPRECATED: Raw card data collection is removed for PCI compliance.
// Payment methods are now handled securely via Stripe Checkout.
// See: /api/billing/create-checkout-session

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Payment methods are now managed through Stripe." },
    { status: 410 }
  );
}
