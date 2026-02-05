import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ComputeMarqueeSection from "@/components/services/compute-marquee-section";
import ComputeFeaturesCurveSection from "@/components/services/compute-features-curve-section";

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
      </div>
      <ComputeFeaturesCurveSection />
    </main>
  );
};

export default ComputeHome;
