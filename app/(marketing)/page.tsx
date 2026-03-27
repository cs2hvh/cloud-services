import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { Hero } from "@/components/hero";
import { ServicesSection } from "@/components/services-section";
import { DomainSearchSection } from "@/components/domain-search-section";
import { ComplianceCta } from "@/components/compliance-cta";
import { WhyTrustUs } from "@/components/why-trust-us";
import { EverythingSection } from "@/components/everything-section";
import GlobalNetworkSection from "@/components/global-network-section";
import FeatureSection from "@/components/feature-section";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Cloud Infrastructure for Modern Teams`,
  description:
    "Deploy VMs, Kubernetes, managed databases, GPU instances, and AI agents across 12 global regions. 99.99% uptime SLA. Provision your entire infrastructure in seconds.",
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    title: `${siteConfig.name} — Cloud Infrastructure for Modern Teams`,
    description:
      "One platform for compute, databases, Kubernetes, and AI. Provision your entire infrastructure in seconds, not hours.",
    url: siteConfig.url,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "AhuraSense Cloud — Cloud Infrastructure Platform",
      },
    ],
  },
  twitter: {
    title: `${siteConfig.name} — Cloud Infrastructure for Modern Teams`,
    description:
      "One platform for compute, databases, Kubernetes, and AI. Provision your entire infrastructure in seconds, not hours.",
    images: [siteConfig.ogImage],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteConfig.url}/#organization`,
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        "@type": "ImageObject",
        url: siteConfig.images.logo,
      },
      sameAs: [],
      description: siteConfig.description,
      foundingDate: "2024",
      areaServed: "Worldwide",
      serviceType: [
        "Cloud Computing",
        "Virtual Private Servers",
        "Managed Kubernetes",
        "GPU Cloud",
        "Managed Databases",
        "Object Storage",
        "DDoS Protection",
        "Domain Registration",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}/#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      description: siteConfig.description,
      publisher: { "@id": `${siteConfig.url}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteConfig.url}/services/domain?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
      inLanguage: "en-US",
    },
    {
      "@type": "WebPage",
      "@id": `${siteConfig.url}/#webpage`,
      url: siteConfig.url,
      name: `${siteConfig.name} — Cloud Infrastructure for Modern Teams`,
      isPartOf: { "@id": `${siteConfig.url}/#website` },
      about: { "@id": `${siteConfig.url}/#organization` },
      description:
        "Deploy virtual machines, Kubernetes clusters, GPU instances, managed databases, and AI agents. Enterprise cloud infrastructure with 99.99% uptime SLA across 12 global regions.",
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteConfig.url,
          },
        ],
      },
      inLanguage: "en-US",
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-black relative overflow-hidden">
        {/* Background Effect */}
        <div className="fixed inset-0 w-full h-full [--color-neutral-300:#1f1f23] [--color-neutral-100:#0a0a0a] [--color-neutral-500:#27272a] [--color-neutral-700:#18181b] [--color-neutral-900:#000000] [--color-neutral-800:#09090b]">
          <BackgroundRippleEffect rows={12} cols={30} cellSize={48} />
        </div>

        {/* Hero Section */}
        <Hero />

      {/* Feature section */}
      {/* <FeatureSection /> */}

        {/* Figma Services Section */}
        <ServicesSection />

        {/* Everything you build */}
        <EverythingSection />

        {/* Domain Search */}
        <DomainSearchSection />

        {/* Global Network */}
        <GlobalNetworkSection />

        {/* Why Trust Us */}
        <WhyTrustUs />

        {/* Compliance CTA */}
        <ComplianceCta />
      </div>
    </>
  );
}
