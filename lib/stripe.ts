import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Lazy Stripe client getter.
 * Avoids throwing at module import time during Next.js build collection.
 */
export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return stripeClient;
}
