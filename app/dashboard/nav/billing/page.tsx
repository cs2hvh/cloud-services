import { redirect } from "next/navigation";

/**
 * Legacy route. Billing now lives at /dashboard/billing.
 *
 * This redirect is NOT optional cleanup that can be deleted later. Stripe
 * Checkout stores `success_url` and `cancel_url` on the session at creation
 * time, so every session created before the rename will send the customer back
 * to /dashboard/nav/billing?status=success&session_id=… after they pay.
 * Removing this route would land a paying customer on a 404 immediately after
 * their card was charged.
 *
 * Query params are preserved verbatim for the same reason: the billing page
 * reads `status` to show the post-payment toast, and dropping it would leave a
 * successful payment looking like nothing happened.
 */
export default async function LegacyNavBillingRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
  }

  const query = params.toString();
  redirect(query ? `/dashboard/billing?${query}` : "/dashboard/billing");
}
