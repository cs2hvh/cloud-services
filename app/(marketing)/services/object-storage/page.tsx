import { assetUrl } from "@/lib/asset-url";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import ObjectStorageFeaturesSection from "@/components/services/object-storage-features-section";
import ObjectStoragePricingSection from "@/components/services/object-storage-pricing-section";
import ObjectStorageCtaSection from "@/components/services/object-storage-cta-section";
import { getStorageCategories } from "@/lib/helpers/storage-categories";
import Image from "next/image";

const CDN = "https://ahurasense.cs2hvh.com/images/2026-06";

const GpuHome = async () => {
  const categories = await getStorageCategories();

  const cases: UseCase[] = [
    {
      iconNode: <Image src={`${CDN}/Xx01oM6sKEUA.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      accent: "#8B5CF6",
      metric: "Media",
      title: "Media & content delivery",
      description:
        "Origin storage for images, video, audio, and static assets — with CDN cache egress free and signed URLs for paid content.",
    },
    {
      iconNode: <Image src={`${CDN}/hobPxjZ-XM5_.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      accent: "#F59E0B",
      metric: "Backup & DR",
      title: "Backups and disaster recovery",
      description:
        "Versioned snapshots, lifecycle transitions to Archive, cross-region replication, and object lock for compliance.",
    },
    {
      iconNode: <Image src={`${CDN}/e9LMMg6VeZvk.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      accent: "#0095FF",
      metric: "Analytics",
      title: "Data lakes and analytics",
      description:
        "S3-compatible object store for log aggregation, training datasets, and analytics pipelines. Works with every S3 tool.",
    },
    {
      iconNode: <Image src={`${CDN}/NZY84e3-oBNx.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      accent: "#10B981",
      metric: "App data",
      title: "Application storage",
      description:
        "User uploads, generated artifacts, and document storage with per-object ACLs, presigned URLs, and AES-256 encryption.",
    },
  ];
  const faqs = [
    {
      question: "What object storage APIs are supported?",
      answer:
        "We provide an S3-compatible API with full support for buckets, object operations, ACLs, and lifecycle rules. You can use existing S3 SDKs and tools.",
    },
    {
      question: "How is data durability and replication handled?",
      answer:
        "Objects are stored redundantly across multiple nodes with configurable replication policies to provide high durability and availability. Snapshots and versioning are supported.",
    },
    {
      question: "What performance can I expect for large uploads/downloads?",
      answer:
        "We use NVMe-backed storage and a high-bandwidth network; performance scales with plan and region. Multipart uploads and parallel downloads are supported for large objects.",
    },
    {
      question: "Is there lifecycle management and object locking?",
      answer:
        "Yes — you can configure lifecycle rules to transition objects between storage tiers, and object locking / retention policies are available for compliance use-cases.",
    },
    {
      question: "How does billing and egress work?",
      answer:
        "Storage is billed by used capacity and transfer. Certain plans include monthly transfer allowances; overages are charged per-GB. Check the Pricing section for plan details.",
    },
  ];
  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        title="Object Storage"
        description="S3-compatible object storage with 99.999% durability, automatic scaling, and built-in CDN. Store and serve any amount of data securely."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
         backgroundImage={{ src: assetUrl("/images/hero/service-hero-bg.png"), alt: "" }}
        illustration={{ src: assetUrl("/images/main-page/object-space.png"), alt: "Object Storage infrastructure" }}
      />
      <ObjectStoragePricingSection categories={categories || undefined} />
      <ObjectStorageFeaturesSection />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      <ServicesHomeSectionSix
        cases={cases}
        hideEyebrow
        heading="Built for the data you"
        headingAccent="actually store."
        subtitle="One S3-compatible store, four workloads — 99.999% durability, lifecycle automation, free CDN cache egress."
      />
      <ObjectStorageCtaSection />
    </main>
  );
};

export default GpuHome;
