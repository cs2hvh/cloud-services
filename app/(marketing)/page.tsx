import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { Hero } from "@/components/hero";
import { ClosingCta } from "@/components/home/closing-cta";
import { ComputeSection } from "@/components/compute-section";
import InferenceModelsSection from "@/components/services/inference-models-section";
import GlobalNetworkSection from "@/components/global-network-section";
import HomePopup from "@/components/home-popup";
import { PlatformExplorer } from "@/components/home/platform-explorer";
import { ClustersBand } from "@/components/home/clusters-band";

// The hero rail reads live GPU price and stock. Without this the page is
// prerendered at build time and would serve frozen numbers — the same class
// of staleness this work removed. Matches /services/gpu.
export const revalidate = 300;
// import FeatureSection from "@/components/feature-section";

const HOME_TITLE = `${siteConfig.name}: AI Inference, GPUs & Cloud Infrastructure`;
const HOME_OG_DESCRIPTION =
  "Run serverless AI inference, fine-tune and deploy models, and build AI agents with RAG, on on-demand GPUs, plus compute, databases, and Kubernetes. Your entire AI stack and infrastructure in seconds, not hours.";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description:
    "Serverless AI inference, model fine-tuning and deployment, AI agents with RAG and vector search, and on-demand GPUs, alongside VMs, Kubernetes, and managed databases from one production control plane.",
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
        alt: "AhuraSense Cloud: AI & Cloud Infrastructure Platform",
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
        "Run serverless AI inference, fine-tune and deploy models, build AI agents with RAG, and launch on-demand GPUs, alongside virtual machines, Kubernetes, managed databases, storage, and apps from one production control plane.",
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
      {/*
        The full-page BackgroundRippleEffect and the hero's PixelBlast field are
        gone. Both were decorative — they cost bundle weight and paint time and
        carried no meaning — and the sections now provide their own ground.
      */}
      <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--ah-bg)" }}>
        {/* Hero + live GPU rail */}
        <Hero />

        {/* Everything you need to build and scale — service explorer */}
        <PlatformExplorer />

        {/* Reserved & cluster GPUs — full-bleed band, breaks the page rhythm */}
        <ClustersBand />

        {/* Model catalog — same component the /services/inference page renders */}
        <InferenceModelsSection variant="home" />

        {/* Compute lineup — VPS / Dedicated / Bare Metal */}
        <ComputeSection />


        {/* Global network */}
        <GlobalNetworkSection />

        {/* Closing CTA strip */}
        <ClosingCta />
      </div>
    </>
  );
}
