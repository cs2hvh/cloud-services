import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/auth";
import { PageHeader } from "@admin/components/page-header";
import { Panel, Callout } from "@admin/components/deploy/bits";

export const dynamic = "force-dynamic";

/**
 * Status stub, deliberately. The old pricing surface (public.products,
 * instance_plans, gpu_pricing) was dropped on 2026-08-31 — archived in
 * pricing_archive_20260831 — and the platform currently has ZERO prices.
 * The canonical replacement is billing.service_pricing (append-only price
 * book; see docs/BILLING-HANDOFF.md for the full contract). This page becomes
 * the single write surface on top of it; until that lands it states the
 * world honestly instead of rendering a dead deep-link.
 */
export default async function PricingStatusPage() {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="Price book rebuild in progress — this page becomes the single place a price is set"
      />

      <Callout tone="critical">
        <strong className="font-semibold">
          The platform currently has zero prices.
        </strong>{" "}
        Nothing can be priced, provisioned or billed until the new price book
        is seeded. This is deliberate: the legacy tables were dropped rather
        than emptied so failing paths throw instead of silently making every
        service free.
      </Callout>

      <div className="mt-6 space-y-6">
        <Panel
          title="What happened"
          subtitle="2026-08-31 — billing/pricing rebuild (see docs/BILLING-HANDOFF.md)"
        >
          <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>
              <code>public.products</code>, <code>public.instance_plans</code>{" "}
              and <code>public.gpu_pricing</code> were dropped. All 290 rows
              are archived in <code>pricing_archive_20260831</code>.
            </li>
            <li>
              The old surface had no single source of truth — the same price
              lived in a DB table, a TypeScript constant and a marketing page,
              and they drifted. It also produced a repeating 720× unit defect
              (monthly figures written into hourly columns) that overcharged a
              real customer $4,629.91 for an empty bucket.
            </li>
            <li>
              The replacement is <code>billing.service_pricing</code>: an
              append-only price book where a price is stored in the unit it was
              quoted in, only one live row may exist per service and plan,
              changes close a row and insert a new one (never UPDATE), and
              charges reference the exact price row that produced them.
            </li>
          </ul>
        </Panel>

        <Panel
          title="What this page becomes"
          subtitle="The single write surface on the price book"
        >
          <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>
              Every price write audited (actor, old → new) via the panel&apos;s
              audit log.
            </li>
            <li>
              Monthly-equivalent preview on every hourly rate before commit —
              $120/hr renders as $87,600/mo, which nobody approves by accident.
            </li>
            <li>
              Rates more than ~10× the category median rejected or requiring
              explicit confirmation, on top of the database&apos;s own bounds.
            </li>
            <li>
              Discounts and free allowances (<code>billing.discounts</code>)
              managed separately from credit-grant promo codes — they are
              different instruments and do not stack.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
