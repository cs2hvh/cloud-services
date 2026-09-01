import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@admin/components/page-header";
import { Callout } from "@admin/components/deploy/bits";
import { PriceBook } from "@admin/components/pricing/price-book";
import {
  BILLING_ACTIVE_SINCE,
  SWEEP_STATUS,
  type PriceRow,
  type ServicePlan,
} from "@admin/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * The single write surface on the price book (billing.service_pricing).
 *
 * Catalog comes from public.service_plans (spec-only, no price columns);
 * current prices are simply effective_to IS NULL — the partial unique index
 * guarantees at most one per (service_type, plan_key). All writes go through
 * billing.set_price() via /api/admin/pricing/set-price, which audits with
 * actor and old → new. Contract and history: docs/BILLING-HANDOFF.md.
 */
export default async function PricingPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const supabase = await createServiceClient();
  const [plansRes, pricesRes] = await Promise.all([
    supabase
      .from("service_plans")
      .select("*")
      .eq("is_active", true)
      .order("service_type")
      .order("sort_order"),
    supabase
      .schema("billing")
      .from("service_pricing")
      .select("*")
      .is("effective_to", null),
  ]);

  if (plansRes.error) {
    return (
      <div>
        <PageHeader title="Pricing" />
        <Callout tone="critical">
          Could not read the plan catalog (public.service_plans):{" "}
          {plansRes.error.message}
        </Callout>
      </div>
    );
  }
  if (pricesRes.error) {
    return (
      <div>
        <PageHeader title="Pricing" />
        <Callout tone="critical">
          Could not read the price book (billing.service_pricing):{" "}
          {pricesRes.error.message}
        </Callout>
      </div>
    );
  }

  const plans = (plansRes.data ?? []) as ServicePlan[];
  const prices = (pricesRes.data ?? []) as PriceRow[];
  const priced = new Set(prices.map((p) => `${p.service_type}:${p.plan_key}`));
  const unpricedCount = plans.filter(
    (p) => !priced.has(`${p.service_type}:${p.plan_key}`),
  ).length;

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="The price book — the one place a price is set. Writes go through billing.set_price() and are audited."
      />

      {prices.length === 0 ? (
        <Callout tone="critical">
          <strong className="font-semibold">
            The platform has zero live prices.
          </strong>{" "}
          Nothing can be priced, provisioned or billed until plans below are
          priced. Unpriced hours are refused by the sweep — never billed as
          zero.{" "}
          <Link href="/pricing/seed" className="underline">
            Review &amp; seed from the archive →
          </Link>
        </Callout>
      ) : (
        <>
          {SWEEP_STATUS === "unscheduled" && (
            <Callout tone="critical">
              <strong className="font-semibold">
                Prices exist but the billing sweep is not scheduled
              </strong>{" "}
              — nothing is being billed. A fully-priced book that is not being
              swept reads as &quot;billing is live&quot;, and that misreading
              is what let six days of unbilled usage pass unnoticed.
            </Callout>
          )}
          {SWEEP_STATUS === "scheduled_unwatched" && (
            <Callout tone="warning">
              <strong className="font-semibold">
                The sweep runs hourly, but nothing is watching the sweep
              </strong>{" "}
              — the deadman check needs two repository secrets before it can
              alert. Scheduled-but-unwatched is exactly the state that let six
              days of unbilled usage pass unnoticed. Billing is active since{" "}
              {new Date(BILLING_ACTIVE_SINCE).toUTCString().slice(0, 22)} UTC;
              no earlier hour can ever be billed unless a price is
              deliberately backdated.
            </Callout>
          )}
          {unpricedCount > 0 && (
            <Callout tone="warning">
              {unpricedCount} of {plans.length} active plans have no live
              price. An unpriced plan provisions nothing and bills nothing —
              the sweep refuses its hours.{" "}
              <Link href="/pricing/seed" className="underline">
                Seed screen →
              </Link>
            </Callout>
          )}
        </>
      )}

      <PriceBook plans={plans} prices={prices} />

      <p className="mt-6 text-xs text-muted-foreground">
        Prices are append-only: a change closes the current row and inserts a
        new one on an hour boundary, so every historical charge keeps pointing
        at the exact price that produced it. Same-hour revisions correct in
        place (the sweep only bills completed hours). Full contract:
        docs/BILLING-HANDOFF.md.
      </p>
    </div>
  );
}
