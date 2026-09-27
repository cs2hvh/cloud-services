import type { Metadata } from "next";

import { assetUrl } from "@/lib/asset-url";
import { siteConfig } from "@/config/site";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import { BareMetalLineup } from "@/components/services/bare-metal-lineup";
import { BARE_METAL_SKUS } from "@/lib/catalog/bare-metal";

/**
 * /services/compute/bare-metal — the dedicated-server storefront.
 *
 * WHY IT IS ITS OWN PAGE. /services/compute featured three machines inside
 * ComputeReleaseSection and sent "Browse all server SKUs" to an anchor on the
 * same page, so the other thirteen never appeared anywhere a customer could
 * reach. Dedicated is a different purchase from a VM — a monthly
 * commitment on specific silicon, chosen by workload — and it needs the room to
 * be compared.
 *
 * EVERY NUMBER ON THIS PAGE IS DERIVED FROM lib/catalog/bare-metal.ts,
 * including the hero stats. That file is the single source for this lineup and
 * exists BECAUSE there were two: the Xeon E-2388G read $99 on the marketing
 * site and $199 in the dashboard, and a visitor found out after signing up.
 * A hand-typed "17 machines from $69" in this file would recreate exactly that
 * defect, one page over, so the counts below are computed.
 *
 * The copy is deliberately thin pending the product description.
 */

const PRICES = BARE_METAL_SKUS.map((s) => s.priceMonthly);
const FROM = Math.min(...PRICES);
const REGION_COUNT = new Set(BARE_METAL_SKUS.flatMap((s) => s.regions)).size;
const READY_NOW = BARE_METAL_SKUS.filter((s) => s.stock === "in-stock").length;

const TITLE = "Dedicated Servers & Bare Metal";
const DESCRIPTION =
  `Single-tenant AMD and Intel machines with full root access, from $${FROM} a month. ` +
  `${BARE_METAL_SKUS.length} configurations across ${REGION_COUNT} regions — ` +
  `high-frequency, server-grade, storage-dense and dual-socket.`;

export const metadata: Metadata = {
  title: `${TITLE} | ${siteConfig.name}`,
  description: DESCRIPTION,
  alternates: {
    canonical: `${siteConfig.url}/services/compute/bare-metal`,
  },
  openGraph: {
    title: `${TITLE} | ${siteConfig.name}`,
    description: DESCRIPTION,
    url: `${siteConfig.url}/services/compute/bare-metal`,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    title: `${TITLE} | ${siteConfig.name}`,
    description: DESCRIPTION,
    images: [siteConfig.ogImage],
  },
};

export default function BareMetalPage() {
  return (
    <div className="relative min-h-screen" style={{ background: "var(--ah-bg)" }}>
      <ServiceHeroSection
        badge="Dedicated servers"
        title={
          <>
            The whole machine, <span className="text-[#0095FF]">yours alone</span>.
          </>
        }
        description={DESCRIPTION}
        primaryAction={{ label: "See the lineup", href: "#lineup" }}
        secondaryAction={{ label: "Talk to us", href: "/contact" }}
        /*
          Stats computed from the catalog, never typed. Note what is NOT here:
          no deploy-time claim. /services/compute advertises "< 30s to deploy",
          which is true of a VM and false of these — the catalog's own stock
          field says machines are available now, in a day, or in two. Repeating
          the VM number would be the v1 dashboard's habit of shipping a claim
          the system cannot meet.
        */
        highlights={[
          { value: String(BARE_METAL_SKUS.length), label: "Configurations" },
          { value: `$${FROM}`, label: "From, per month" },
          { value: String(REGION_COUNT), label: "Regions" },
          { value: String(READY_NOW), label: "Available now" },
        ]}
        illustration={{
          src: assetUrl("/images/main-page/compute.png"),
          alt: "Dedicated server hardware",
        }}
      />

      <BareMetalLineup />
    </div>
  );
}
