import { ServiceHeroSection } from "@/components/services/service-hero-section";

const GpuHome = () => {
  return (
    <main className="min-h-screen bg-black">
      <ServiceHeroSection
        badge="Accelerated AI Infrastructure"
        title="GPU"
        description="Launch dedicated NVIDIA GPU instances for model training, inference, rendering, and high-throughput data processing with on-demand scaling."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/gpu-instance.svg", alt: "GPU server" }}
      />
    </main>
  );
};

export default GpuHome;
