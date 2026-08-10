import { Suspense } from "react";
import { getFullPricingData, type ServiceCategory } from "@/lib/supabase/queries/pricing";
import { buildComputePricingCategory, buildGpuPricingCategory } from "@/lib/catalog/pricing-categories";
import { createServiceClient } from "@/lib/supabase/server";
import PricingClient from "@/components/pricing/pricing-client"

// FALLBACK_PRICING_DATA used to live here: a hand-written table of every
// service. Compute quoted $79/mo for 8 vCPU/32GB against a real $51.84, and the
// GPU block was spliced in over live data on purpose. Both now come from
// lib/catalog, which runs the same resolvers as checkout. There is deliberately
// no replacement constant — see PricingUnavailable below.

// Loading skeleton
function PricingLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-[#04060a] text-white">
      <section className="mx-auto w-full max-w-[1240px] px-[clamp(20px,4vw,48px)] pt-28 pb-10 sm:pt-32">
        <div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-5 h-12 w-2/3 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-white/[0.05]" />
        <div className="mt-8 h-10 w-56 animate-pulse rounded-[7px] bg-white/[0.06]" />
      </section>
      <section className="mx-auto w-full max-w-[1240px] px-[clamp(20px,4vw,48px)] pb-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          <aside className="lg:w-52 lg:shrink-0">
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-white/[0.05]" />
              ))}
            </div>
          </aside>
          <div className="flex-1 space-y-4">
            <div className="h-8 w-48 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-64 animate-pulse rounded-[8px] bg-white/[0.04]" />
          </div>
        </div>
      </section>
    </main>
  );
}

async function PricingContent() {
  // Everything except compute and GPU comes from pricing_categories x products.
  const fromDb = (await getFullPricingData()) ?? [];

  // Compute and GPU are served from the shared catalog instead, so this page
  // quotes the same number the deploy wizard and the invoice do. Both used to
  // come from a FALLBACK_PRICING_DATA constant in this file — compute at $79/mo
  // for 8 vCPU/32GB against a real $51.84, and GPU replaced with that static
  // block even when the database had data.
  // allSettled, not all: a compute failure must not also remove GPU.
  let compute: ServiceCategory | null = null;
  let gpu: ServiceCategory | null = null;
  try {
    const supabase = await createServiceClient();
    const [c, g] = await Promise.allSettled([
      buildComputePricingCategory(supabase),
      buildGpuPricingCategory(supabase),
    ]);
    if (c.status === "fulfilled") compute = c.value;
    else console.error("[pricing] compute catalog read failed:", c.reason);
    if (g.status === "fulfilled") gpu = g.value;
    else console.error("[pricing] gpu catalog read failed:", g.reason);
  } catch (error) {
    console.error("[pricing] catalog read failed:", error);
  }

  // Drop any database or legacy entry for these two; the catalog is canonical.
  const rest = fromDb.filter(
    (c) => !["compute", "gpu", "gpu-instance"].includes(c.id)
  );

  // A category that failed to build is shown as unavailable rather than
  // dropped. Silently omitting it leaves a visitor on a pricing page with no
  // compute and nothing saying why — worse than an explicit gap.
  const placeholder = (id: string, label: string): ServiceCategory => ({
    id,
    label,
    description:
      "Live pricing is briefly unavailable. Current prices are quoted in the dashboard before you deploy.",
    tiers: [],
  });

  const pricingData: ServiceCategory[] = [
    compute ?? placeholder("compute", "Compute"),
    gpu ?? placeholder("gpu-instance", "GPU Instances"),
    ...rest,
  ];

  // Every source failed — no catalog and no database. The placeholders above
  // would still render two empty tabs, which is a worse answer than saying so.
  if (!compute && !gpu && rest.length === 0) return <PricingUnavailable />;

  return <PricingClient categories={pricingData} />;
}

/**
 * Shown only when the catalog AND the database both fail. A single failing
 * category renders an inline placeholder instead — see above.
 *
 * Deliberately has no numbers: this page previously fell back to a hardcoded
 * table that disagreed with checkout on every compute plan.
 */
function PricingUnavailable() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-32 text-center">
      <h2 className="text-3xl font-semibold text-white">Pricing is briefly unavailable</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-white/55">
        We could not load live pricing just now. Please refresh in a moment — or
        see current prices in the dashboard, where every plan is quoted before
        you deploy.
      </p>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingLoadingSkeleton />}>
      <PricingContent />
    </Suspense>
  );
}

// Enable ISR with 5 minute revalidation
export const revalidate = 300;
