import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ComputeMarqueeSection from "@/components/services/compute-marquee-section";
import ComputeFeaturesCurveSection from "@/components/services/compute-features-curve-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";

const ComputeHome = () => {
  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="High Performance Computing"
        title="Compute"
        description="High-performance GPU computing for AI training, rendering, and scientific computing. Access the latest NVIDIA hardware on demand."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/hero-bg.png", alt: "" }}
        illustration={{ src: "/pages/compute/compute.svg", alt: "Compute infrastructure" }}
      />
      <div className="relative z-20 -mt-6 sm:-mt-18 lg:-mt-20">
        <ComputeMarqueeSection />
        <div className="relative z-10 -mt-16 sm:-mt-20 lg:-mt-28">
          <ComputeFeaturesCurveSection
            backgroundImage="/images/compute-page/curve-feature-section-bg.png"
            curveImage="/images/compute-page/curv-logo-and-content.png"
          />
        </div>
      </div>
      <ServicesHomeSectionFive
        title="Frequently Asked Questions"
        faqs={[
          {
            question: "Where is our data centers located ?",
            answer:
              "We operate multiple global regions across North America, Europe, and Asia-Pacific. Specific locations are available in the dashboard once you sign in.",
          },
          {
            question: "How do I get started with AhuraCloud ?",
            answer:
              "Create an account, verify your email, and launch your first service from the dashboard. You can also contact sales for guided onboarding.",
          },
          {
            question: "What payments methods are accepted ?",
            answer:
              "We accept all major credit and debit cards (Visa, Mastercard, Amex), ACH bank transfers for US-based customers, and wire transfers for enterprise accounts. Annual billing with invoicing is available on Pro and Enterprise plans.",
          },
          {
            question: "What databases are supported ?",
            answer:
              "We support PostgreSQL, MySQL, Redis, and MongoDB with managed and self-hosted options depending on your plan.",
          },
          {
            question: "How does Kubernetes work on AhuraSense ?",
            answer:
              "We provide managed Kubernetes clusters with automated upgrades, node scaling, and built-in observability.",
          },
          {
            question: "Do we offer DDoS Protection ?",
            answer:
              "Yes, DDoS protection is included for network-facing services with configurable rules for advanced scenarios.",
          },
          {
            question: "What support options are available ?",
            answer:
              "Support is available via email and chat on all plans, with 24/7 priority support for enterprise customers.",
          },
        ]}
      />
    </main>
  );
};

export default ComputeHome;
