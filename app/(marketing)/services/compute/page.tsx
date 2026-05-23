import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ComputeReleaseSection from "@/components/services/compute-release-section";
import ComputePricingSection from "@/components/services/compute-pricing-section";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { getComputeCategories } from "@/lib/helpers/compute-categories";
import { Database, GitBranch, Globe, Radio } from "lucide-react";

const ComputeHome = async () => {
  const categories = await getComputeCategories();
  const cases: UseCase[] = [
    {
      icon: Globe,
      metric: "Web & SaaS",
      title: "Production web apps and APIs",
      description:
        "Host high-traffic sites, REST/gRPC APIs, and SaaS backends on dedicated cores with sub-20 ms regional latency, managed TLS, and instant blue-green deploys.",
    },
    {
      icon: Database,
      metric: "Data tier",
      title: "Self-managed database servers",
      description:
        "Run PostgreSQL, MySQL, Redis, or MongoDB on NVMe-backed instances with snapshot scheduling, point-in-time recovery, and replicated block volumes.",
    },
    {
      icon: GitBranch,
      metric: "CI/CD",
      title: "Build farms and CI runners",
      description:
        "Parallel build pipelines and self-hosted runners on dedicated CPUs — persistent cache volumes, ephemeral worker pools, and BYO container registry.",
    },
    {
      icon: Radio,
      metric: "Real-time",
      title: "Game, media, and streaming servers",
      description:
        "Low-latency multiplayer backends and live media origins across 12 regions, with always-on L3/L4 DDoS mitigation and 25 Gbps networking.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="Cloud Compute"
        title="Compute"
        description="Deploy virtual machines, VDS, and dedicated servers across 12 global regions. Full root access, NVMe storage, and sub-20ms latency — scale from a single core to 64 vCPUs in seconds."
        primaryAction={{ label: "Deploy a Server", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{
          src: "/images/hero/service-hero-bg.png",
          alt: "",
        }}
        illustration={{
          src: "/images/main-page/compute.png",
          alt: "Compute infrastructure",
        }}
      />
      <ComputeReleaseSection />
      {/* <ComputeFeaturesCurveSection
        backgroundImage="/images/compute-page/curve-feature-section-bg.png"
        curveImage="/images/compute-page/curv-logo-and-content.png"
      /> */}
      <ComputePricingSection categories={categories || undefined} />
      <ServicesHomeSectionFive
        title="Frequently Asked Questions"
        faqs={[
          {
            question: "What types of compute instances are available?",
            answer:
              "We offer shared vCPU, dedicated vCPU, and bare-metal server options. Shared instances are ideal for dev/staging, dedicated vCPU for production workloads, and bare-metal for maximum performance with no virtualization overhead.",
          },
          {
            question: "Which operating systems are supported?",
            answer:
              "All major Linux distributions including Ubuntu, Debian, CentOS, Rocky Linux, AlmaLinux, and Fedora. Windows Server images are also available. You can also upload and boot custom ISO images.",
          },
          {
            question: "How fast can I deploy a server?",
            answer:
              "Most instances are provisioned within 30-60 seconds. Select your region, OS, and plan — your server will be ready with a public IP and full root/SSH access.",
          },
          {
            question: "Can I resize my instance later?",
            answer:
              "Yes. You can vertically scale (upgrade vCPU, RAM, and storage) with minimal downtime. Horizontal scaling is also supported through our load balancer and auto-scaling groups.",
          },
          {
            question: "What kind of storage is used?",
            answer:
              "All instances use enterprise-grade NVMe SSDs with up to 7 GB/s read speeds. Block storage volumes can be attached for additional capacity and are replicated across three nodes for durability.",
          },
          {
            question: "Is there a bandwidth or traffic limit?",
            answer:
              "Each plan includes a generous bandwidth allowance (4 TB to 32 TB depending on tier). Inbound traffic is always free. Overages are billed at competitive per-GB rates with no surprises.",
          },
          {
            question: "Do instances include DDoS protection?",
            answer:
              "Yes. All compute instances include always-on L3/L4 DDoS mitigation at no extra cost. L7 protection and advanced WAF rules are available as add-ons.",
          },
        ]}
      />
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="Compute that fits the workload"
        subtitle="Four workloads our customers ship into production every day — backed by the same NVMe-backed instances, 12-region footprint, and 24/7 support."
      />
    </main>
  );
};

export default ComputeHome;
