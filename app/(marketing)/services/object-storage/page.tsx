import { ServiceHeroSection } from "@/components/services/service-hero-section";
// import ServicesHomeSectionFour from "@/components/serviceshome/section-4";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";
import ObjectStorageReleaseSection from "@/components/services/object-storage-release-section";
import ObjectStorageFeaturesSection from "@/components/services/object-storage-features-section";
import ObjectStoragePricingSection from "@/components/services/object-storage-pricing-section";
import ObjectStorageCtaSection from "@/components/services/object-storage-cta-section";
import { getStorageCategories} from "@/lib/helpers/storage-categories";

const GpuHome = async () => {
  // Fetch dynamic storage categories from database
  const categories = await getStorageCategories();
  console.log("Fetched storage categories:", categories);
  
  // Fetch dynamic overview plans for ServicesHomeSectionFour
  // const plans = await getStorageOverviewPlans();

  const cases = [
    {
      title: "Media & Content Delivery",
      description:
        "Store and serve images, videos, and static assets with low-latency access and built-in CDN integration.",
    },
    {
      title: "Backup & Disaster Recovery",
      description:
        "Automated backups with versioning, lifecycle policies, and cross-region replication for business continuity.",
    },
    {
      title: "Data Lakes & Analytics",
      description:
        "Scalable storage for big data workloads, log aggregation, and analytics pipelines with S3-compatible tools.",
    },
    {
      title: "Application Storage",
      description:
        "Store user uploads, application state, and documents with fine-grained access controls and encryption.",
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
        badge="Cloud Storage"
        title="Object Storage"
        description="S3-compatible object storage with 99.999% durability, automatic scaling, and built-in CDN. Store and serve any amount of data securely."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/object-space.png", alt: "Object Storage infrastructure" }}
      />
      <ObjectStorageReleaseSection />
      <ObjectStoragePricingSection categories={categories || undefined} />
      <ObjectStorageFeaturesSection />
      {/* <ServicesHomeSectionFour plans={plans} /> */}
      <ServicesHomeSectionFive title="Frequently Asked Questions" faqs={faqs} />
      <ObjectStorageCtaSection />
      <ServicesHomeSectionSix cases={cases} />
    </main>
  );
};

export default GpuHome;
