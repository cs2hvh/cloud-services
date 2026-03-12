import { ServiceHeroSection } from "@/components/services/service-hero-section";
// import ServicesHomeSectionFour from "@/components/serviceshome/section-4";
import ServicesHomeSectionFour from "@/components/serviceshome/section-4";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";
import ObjectStorageReleaseSection from "@/components/services/object-storage-release-section";
import ObjectStorageFeaturesSection from "@/components/services/object-storage-features-section";
import ObjectStoragePricingSection from "@/components/services/object-storage-pricing-section";
import ObjectStorageCtaSection from "@/components/services/object-storage-cta-section";

const GpuHome = () => {
//   const defaultItems = [
// 	{
// 		title: "Latest GPU Hardware",
// 		description:
// 			"Access NVIDIA H100, A100, and RTX 4090 GPUs for maximum performance. Updated regularly with the latest hardware.",
// 		iconSrc: "/images/main-page/service-home-gpu-1.svg",
// 		iconAlt: "GPU hardware",
// 	},
// 	{
// 		title: "Multi-GPU Support",
// 		description:
// 			"Scale from single GPU to multi-node clusters with NVLink interconnect for distributed training workloads.",
// 		iconSrc: "/images/main-page/service-home-gpu-2.svg",
// 		iconAlt: "Multi GPU",
// 	},
// 	{
// 		title: "Fast Storage",
// 		description:
// 			"High-bandwidth NVMe storage optimized for training data. Local SSD for maximum IOPS.",
// 		iconSrc: "/images/main-page/service-home-gpu-3.svg",
// 		iconAlt: "Fast storage",
// 	},
// 	{
// 		title: "Spot Instances",
// 		description:
// 			"Save up to 90% with spot instances for fault-tolerant workloads. Automatic checkpointing included.",
// 		iconSrc: "/images/main-page/service-home-gpu-4.svg",
// 		iconAlt: "Spot instances",
// 	},
// 	{
// 		title: "Pre-configured Environments",
// 		description:
// 			"Start faster with pre-installed CUDA, cuDNN, PyTorch, TensorFlow, and other ML frameworks.",
// 		iconSrc: "/images/main-page/service-home-gpu-5.svg",
// 		iconAlt: "Preconfigured environments",
// 	},
// ];

// const plans = [
//     {
//         badge: "New",
//         badgePlacement: "outside",
//         title: "Basic",
//         description:
//             "With OVHcloud, you can rely on our expertise in bare-metal technology. Host your website, deploy your high-resilience infrastructure, or customise your machine to suit your projects in just a few clicks.",
//         features: ["1-4 vCPU core", "2-8 GB RAM", "50-200 GB NVMe disk space", "4 TB bandwidth"],
//     },
//     {
//         badge: "Most Recommended",
//         badgePlacement: "inside",
//         title: "General Use",
//         description:
//             "For growing teams and production workloads. With OVHcloud, you can rely on our expertise in bare-metal technology. Host your website, deploy your high-resilience infrastructure, or customise your machine in just a few clicks.",
//         features: ["4-16 vCPU cores", "8-32 GB RAM", "200-400 GB NVMe disk space", "16 TB bandwidth"],
//     },
//     {
//         badge: "Most Scalable",
//         badgePlacement: "inside",
//         title: "High Performance",
//         description:
//             "For organizations with advanced needs. With OVHcloud, you can rely on our expertise in bare-metal technology. Host your website, deploy your high-resilience infrastructure, or customise your machine to suit your projects in just a few clicks.",
//         features: ["16-64 vCPU cores", "32-256 GB RAM", "400-1000 GB NVMe disk space", "32 TB bandwidth"],
//     },
// ];

 const plans = [
    {
      badge: "Starter",
      badgePlacement: "outside",
      title: "Starter",
      description: "Cost-effective object storage for small projects and backups.",
      features: ["50 GB storage", "5 GB/month transfer", "S3-compatible API", "Basic support"],
    },
    {
      badge: "Most Popular",
      badgePlacement: "inside",
      title: "Standard",
      description: "Durable and scalable object storage for web apps and media.",
      features: ["1 TB storage", "1 TB/month transfer", "S3 API + lifecycle rules", "99.99% durability"],
    },
    {
      badge: "Enterprise",
      badgePlacement: "inside",
      title: "Enterprise",
      description: "High-performance storage with SLA and dedicated support.",
      features: ["Custom capacity", "Unlimited transfer", "Private networking", "Dedicated support"],
    },
  ];

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
      {/* <div className="relative z-20 -mt-6 sm:-mt-18 lg:-mt-20">
        <div className="relative z-10 -mt-16 sm:-mt-20 lg:-mt-28">
          <ComputeFeaturesCurveSection
            backgroundImage="/images/compute-page/curve-feature-section-bg.png"
            curveImage="/images/main-page/service-home-object-section-3.png"
          />
        </div>
      </div> */}

      <ObjectStoragePricingSection />
      <ObjectStorageFeaturesSection />
      <ServicesHomeSectionFour plans={plans} />
      <ServicesHomeSectionFive title="Frequently Asked Questions" faqs={faqs} />
      <ObjectStorageCtaSection />
      <ServicesHomeSectionSix cases={cases} />
    </main>
  );
};

export default GpuHome;
