import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { Hero } from "@/components/hero";
import { DomainSearchSection } from "@/components/domain-search-section";
import { ComplianceCta } from "@/components/compliance-cta";
import { EverythingSection } from "@/components/everything-section";
import { ClustersSection } from "@/components/clusters-section";
import { ComputeSection } from "@/components/compute-section";
import GlobalNetworkSection from "@/components/global-network-section";
import HomePopup from "@/components/home-popup";

// The hero rail reads live GPU price and stock. Without this the page is
// prerendered at build time and would serve frozen numbers — the same class
// of staleness this work removed. Matches /services/gpu.
export const revalidate = 300;
// import FeatureSection from "@/components/feature-section";

const HOME_TITLE = `${siteConfig.name} — AI Inference, GPUs & Cloud Infrastructure`;
const HOME_OG_DESCRIPTION =
  "Run serverless AI inference, fine-tune and deploy models, and build AI agents with RAG — on on-demand GPUs, plus compute, databases, and Kubernetes. Your entire AI stack and infrastructure in seconds, not hours.";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description:
    "Serverless AI inference, model fine-tuning and deployment, AI agents with RAG and vector search, and on-demand GPUs — alongside VMs, Kubernetes, and managed databases from one production control plane.",
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_OG_DESCRIPTION,
    url: siteConfig.url,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "AhuraSense Cloud — AI & Cloud Infrastructure Platform",
      },
    ],
  },
  twitter: {
    title: HOME_TITLE,
    description: HOME_OG_DESCRIPTION,
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
        "AI Inference",
        "Serverless AI Inference",
        "Model Fine-Tuning",
        "Model Deployment",
        "AI Agents",
        "Vector Database",
        "GPU Cloud",
        "Cloud Computing",
        "Virtual Private Servers",
        "Managed Kubernetes",
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
      name: HOME_TITLE,
      isPartOf: { "@id": `${siteConfig.url}/#website` },
      about: { "@id": `${siteConfig.url}/#organization` },
      description:
        "Run serverless AI inference, fine-tune and deploy models, build AI agents with RAG, and launch on-demand GPUs — alongside virtual machines, Kubernetes, managed databases, storage, and apps from one production control plane.",
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
      <HomePopup />
      <div className="min-h-screen bg-black relative overflow-hidden">
        {/* Background Effect */}
        <div className="fixed inset-0 w-full h-full [--color-neutral-300:#1f1f23] [--color-neutral-100:#0a0a0a] [--color-neutral-500:#27272a] [--color-neutral-700:#18181b] [--color-neutral-900:#000000] [--color-neutral-800:#09090b]">
          <BackgroundRippleEffect rows={12} cols={30} cellSize={48} />
        </div>

        {/* Hero Section */}
        <Hero />

      {/* Feature section */}
      {/* <FeatureSection /> */}

        {/* Everything you build */}
        <EverythingSection />

        {/* Reserved & Cluster GPUs — talk to sales */}
        <ClustersSection />

        {/* Compute lineup — VPS / Dedicated / Bare Metal */}
        <ComputeSection />

        {/* Domain Search */}
        <DomainSearchSection />

        {/* Global Network */}
        <GlobalNetworkSection />

        {/* Compliance CTA */}
        <ComplianceCta />
      </div>
    </>
  );
}
