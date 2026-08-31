import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { PageHeader } from "@admin/components/page-header";
import { Callout } from "@admin/components/deploy/bits";
import { SeedReview } from "@admin/components/pricing/seed-review";
import type { SeedCandidate } from "@admin/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * One-shot archive seeding, reviewed by a human before anything is written.
 *
 * Candidates come from billing.price_seed_candidates() — archive-derived,
 * containing not a single unit conversion (the conversion is where the 720×
 * defect lives). Applying a group writes each row through billing.set_price()
 * with a per-row audit record, so the price book's history starts at row one.
 */
export default async function PricingSeedPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const supabase = await createServiceClient();
  const billing = supabase.schema("billing");
  const [candRes, liveRes] = await Promise.all([
    billing.rpc("price_seed_candidates"),
    billing
      .from("service_pricing")
      .select("service_type, plan_key")
      .is("effective_to", null),
  ]);

  if (candRes.error) {
    return (
      <div>
        <PageHeader title="Seed the price book" />
        <Callout tone="critical">
          Could not read seed candidates: {candRes.error.message}
        </Callout>
      </div>
    );
  }

  const candidates = (candRes.data ?? []) as SeedCandidate[];
  const pricedKeys = (liveRes.data ?? []).map(
    (r) => `${r.service_type}:${r.plan_key}`,
  );

  return (
    <div>
      <PageHeader
        title="Seed the price book"
        description="Archive-derived candidates, applied per service group through billing.set_price() — reviewed here first, audited from row one"
        actions={
          <Link href="/pricing" className="text-xs text-muted-foreground underline">
            ← price book
          </Link>
        }
      />

      <Callout tone="warning">
        Every amount below is shown in the unit it was archived in — no value
        has been converted anywhere between the archive and this screen.
        Applying a group writes real production prices. The GPU at-cost rate
        (markup 1.000) is a deliberate product decision from 2026-08-26, not a
        mistake to fix here.
      </Callout>

      <SeedReview candidates={candidates} pricedKeys={pricedKeys} />
    </div>
  );
}
