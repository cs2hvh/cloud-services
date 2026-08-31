import { Callout } from "@admin/components/deploy/bits";
import Link from "next/link";

/**
 * Shown wherever a section depends on the dropped plan catalog
 * (public.products / instance_plans / gpu_pricing). A section rendering
 * "0 plans" without this banner is lying about the world.
 */
export function CatalogOfflineBanner() {
  return (
    <Callout tone="critical">
      <strong className="font-semibold">Plan catalog offline.</strong> The
      pricing tables were dropped on 2026-08-31 as part of the billing rebuild
      (data archived in <code>pricing_archive_20260831</code>). Plan lists and
      assignment are unavailable until the new price book is seeded — status
      and details on the{" "}
      <Link href="/pricing" className="underline">
        Pricing page
      </Link>
      .
    </Callout>
  );
}
