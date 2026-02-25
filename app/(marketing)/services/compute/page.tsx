import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ComputeReleaseSection from "@/components/services/compute-release-section";
import ComputePricingSection from "@/components/services/compute-pricing-section";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const ComputeHome = () => {
  const cases = [
    {
      title: "Web & Application Hosting",
      description:
        "Host websites, APIs, and web applications on dedicated virtual machines with guaranteed uptime, auto-scaling, and global load balancing.",
    },
    {
      title: "Database Servers",
      description:
        "Run self-managed PostgreSQL, MySQL, or Redis instances on high-IOPS NVMe storage with automated backups and point-in-time recovery.",
    },
    {
      title: "CI/CD & Build Pipelines",
      description:
        "Accelerate your development workflow with dedicated build servers. Run parallel test suites, container builds, and deployments at scale.",
    },
    {
      title: "Game & Streaming Servers",
      description:
        "Deploy low-latency game servers and media streaming backends across 12 global regions with DDoS protection included.",
    },
  ];

  return (
    <main className="bg-black">
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
          src: "/pages/compute/compute.svg",
          alt: "Compute infrastructure",
        }}
      />
      <ComputeReleaseSection />
      {/* <ComputeFeaturesCurveSection
        backgroundImage="/images/compute-page/curve-feature-section-bg.png"
        curveImage="/images/compute-page/curv-logo-and-content.png"
      /> */}
      <ComputePricingSection />
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
      <ServicesHomeSectionSix cases={cases} />
    </main>
  );
};

export default ComputeHome;
