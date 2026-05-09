import DomainTransferSection from "@/components/services/domain-transfer-section";
import DomainChoiceSection from "@/components/services/domain-choice-section";
import DomainPricingSection from "@/components/services/domain-pricing-section";
import DomainGuidesSection from "@/components/services/domain-guides-section";
import DomainWhyChooseSection from "@/components/services/domain-why-choose-section";
import DomainSupportSection from "@/components/services/domain-support-section";
import DomainArcCtaSection from "@/components/services/domain-arc-cta-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const DomainHome = () => {
  return (
    <main className="bg-[#0E0F0F]">
      <DomainTransferSection />
      <DomainChoiceSection />
      <DomainPricingSection />
      <DomainGuidesSection />
      <DomainWhyChooseSection />
      <DomainSupportSection />
      <ServicesHomeSectionFive
        title="Frequently Asked Questions"
        faqs={[
          {
            question: "Where is out data centers located ?",
            answer:
              "We offer shared vCPU, dedicated vCPU, and bare-metal server options. Shared instances are ideal for dev/staging, dedicated vCPU for production workloads, and bare-metal for maximum performance with no virtualization overhead.",
          },
          {
            question: "How do I get started with AhuraSense ?",
            answer:
              "All major Linux distributions including Ubuntu, Debian, CentOS, Rocky Linux, AlmaLinux, and Fedora. Windows Server images are also available. You can also upload and boot custom ISO images.",
          },
          {
            question: "What payments methods are accepted ?",
            answer:
              "Most instances are provisioned within 30-60 seconds. Select your region, OS, and plan — your server will be ready with a public IP and full root/SSH access.",
          },
          {
            question: "What databases are supported ?",
            answer:
              "Yes. You can vertically scale (upgrade vCPU, RAM, and storage) with minimal downtime. Horizontal scaling is also supported through our load balancer and auto-scaling groups.",
          },
          {
            question: "How does Kubernets work on AhuraSense ?",
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
      <DomainArcCtaSection />
    </main>
  );
};

export default DomainHome;
