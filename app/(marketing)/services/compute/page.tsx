import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ComputeReleaseSection from "@/components/services/compute-release-section";
import ComputePricingSection from "@/components/services/compute-pricing-section";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import { getComputeCategories } from "@/lib/helpers/compute-categories";

// Premium custom use-case icons — solid white glyphs with a minimal blue accent.
const ICON_SIZE = "h-[22px] w-[22px]";

// Web & SaaS — browser window with an API code glyph (white body, blue </>)
const WebIcon = (
  <svg viewBox="0 0 24 24" className={ICON_SIZE} aria-hidden="true">
    {/* window frame */}
    <rect x="3" y="4" width="18" height="16" rx="2.6" fill="#fff" />
    {/* title-bar dots — one blue accent */}
    <circle cx="6" cy="6.4" r="0.75" fill="#0095FF" />
    <circle cx="8.3" cy="6.4" r="0.75" fill="#c2c8d0" />
    <circle cx="10.6" cy="6.4" r="0.75" fill="#c2c8d0" />
    {/* header divider */}
    <rect x="3" y="8.7" width="18" height="0.85" fill="#e4e8ed" />
    {/* </> code mark */}
    <path
      d="M10 12.6 L8.3 14.8 L10 17 M14 12.6 L15.7 14.8 L14 17"
      fill="none"
      stroke="#0095FF"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12.9 11.9 L11.1 17.7"
      fill="none"
      stroke="#0095FF"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

// Data tier — database cylinder (white body, blue top disc)
const DataIcon = (
  <svg viewBox="0 0 24 24" className={ICON_SIZE} aria-hidden="true">
    <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6Z" fill="#fff" />
    <ellipse cx="12" cy="6" rx="7" ry="3" fill="#0095FF" />
    <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" fill="none" stroke="#0E0F0F" strokeWidth="1" opacity="0.18" />
  </svg>
);

// CI/CD — branch / merge nodes (white nodes + connector, one blue node)
const PipelineIcon = (
  <svg viewBox="0 0 24 24" className={ICON_SIZE} aria-hidden="true" fill="none">
    <path d="M6.5 8.5v7M6.5 12h6a4 4 0 0 0 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <circle cx="6.5" cy="6" r="2.6" fill="#fff" />
    <circle cx="6.5" cy="18" r="2.6" fill="#fff" />
    <circle cx="16.5" cy="6" r="2.6" fill="#0095FF" />
  </svg>
);

// Real-time — broadcast signal (blue core, white waves)
const RealtimeIcon = (
  <svg viewBox="0 0 24 24" className={ICON_SIZE} aria-hidden="true" fill="none">
    <circle cx="12" cy="12" r="2.8" fill="#0095FF" />
    <path
      d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4"
      stroke="#fff"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

const ComputeHome = async () => {
  const categories = await getComputeCategories();
  const cases: UseCase[] = [
    {
      iconNode: WebIcon,
      metric: "Web & SaaS",
      title: "Production web apps and APIs",
      description:
        "Host high-traffic sites, REST/gRPC APIs, and SaaS backends on dedicated cores with sub-20 ms regional latency, managed TLS, and instant blue-green deploys.",
    },
    {
      iconNode: DataIcon,
      metric: "Data tier",
      title: "Self-managed database servers",
      description:
        "Run PostgreSQL, MySQL, Redis, or MongoDB on NVMe-backed instances with snapshot scheduling, point-in-time recovery, and replicated block volumes.",
    },
    {
      iconNode: PipelineIcon,
      metric: "CI/CD",
      title: "Build farms and CI runners",
      description:
        "Parallel build pipelines and self-hosted runners on dedicated CPUs — persistent cache volumes, ephemeral worker pools, and BYO container registry.",
    },
    {
      iconNode: RealtimeIcon,
      metric: "Real-time",
      title: "Game, media, and streaming servers",
      description:
        "Low-latency multiplayer backends and live media origins across 12 regions, with always-on L3/L4 DDoS mitigation and 25 Gbps networking.",
    },
  ];

  return (
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="Compute"
        title={
          <>
            Compute, ready in <span className="text-[#0095FF]">seconds</span>.
          </>
        }
        description="Virtual machines, VDS, and dedicated servers with full root access, enterprise NVMe, and sub-20 ms latency — spun up across our global network in seconds."
        primaryAction={{ label: "Deploy a Server", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        highlights={[
          { value: "15", label: "Global regions" },
          { value: "7 GB/s", label: "NVMe storage" },
          { value: "< 30s", label: "To deploy" },
          { value: "L3–L7", label: "DDoS included" },
        ]}
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
        heading="Compute that fits"
        headingAccent="the workload."
        subtitle="Four workloads our customers ship every day — same NVMe instances, 12-region footprint, 24/7 support."
      />
    </main>
  );
};

export default ComputeHome;
