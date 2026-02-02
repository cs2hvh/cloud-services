import { ServiceHeroSection } from "@/components/services/service-hero-section";

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
    </main>
  );
};

export default ComputeHome;
