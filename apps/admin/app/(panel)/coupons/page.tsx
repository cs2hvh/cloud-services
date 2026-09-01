import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@admin/components/page-header";
import { Callout } from "@admin/components/deploy/bits";
import { CouponsView } from "@admin/components/coupons/coupons-view";
import type { Discount, Promocode } from "@admin/lib/offers";

export const dynamic = "force-dynamic";

/**
 * Two instruments, one page, never merged: promocodes grant credit
 * (legacy, read-only here), discounts change rates (v2, created here).
 * See apps/admin/lib/offers.ts for the data-honesty rules this page obeys.
 */
export default async function CouponsPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");
  const [promoRes, discountRes, grantsRes, plansRes] = await Promise.all([
    billing.from("promocodes").select("*").order("created_at", { ascending: false }),
    billing.from("discounts").select("*").order("created_at", { ascending: false }),
    billing.from("discount_grants").select("discount_id"),
    supabase.from("service_plans").select("service_type"),
  ]);

  const firstError =
    promoRes.error ?? discountRes.error ?? grantsRes.error ?? plansRes.error;
  if (firstError) {
    return (
      <div>
        <PageHeader title="Coupons & Discounts" />
        <Callout tone="critical">
          Could not read offers: {firstError.message}
        </Callout>
      </div>
    );
  }

  const grantCounts: Record<string, number> = {};
  for (const g of grantsRes.data ?? []) {
    grantCounts[g.discount_id] = (grantCounts[g.discount_id] ?? 0) + 1;
  }
  const serviceTypes = [
    ...new Set((plansRes.data ?? []).map((p) => p.service_type as string)),
  ].sort();

  return (
    <div>
      <PageHeader
        title="Coupons & Discounts"
        description="Promocodes grant wallet credit; discounts change what an hour costs. Different instruments — never converted into each other."
      />
      <CouponsView
        promocodes={(promoRes.data ?? []) as Promocode[]}
        discounts={(discountRes.data ?? []) as Discount[]}
        grantCounts={grantCounts}
        serviceTypes={serviceTypes}
      />
    </div>
  );
}
