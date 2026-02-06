import ComputeFeaturesCurveSection from "@/components/services/compute-features-curve-section";
import ComputeMarqueeSection from "@/components/services/compute-marquee-section";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionTwo from "@/components/serviceshome/section-2";
import ServicesHomeSectionFour from "@/components/serviceshome/section-4";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";

const GpuHome = () => {
  const defaultItems = [
	{
		title: "Latest GPU Hardware",
		description:
			"Access NVIDIA H100, A100, and RTX 4090 GPUs for maximum performance. Updated regularly with the latest hardware.",
		iconSrc: "/images/main-page/service-home-gpu-1.svg",
		iconAlt: "GPU hardware",
	},
	{
		title: "Multi-GPU Support",
		description:
			"Scale from single GPU to multi-node clusters with NVLink interconnect for distributed training workloads.",
		iconSrc: "/images/main-page/service-home-gpu-2.svg",
		iconAlt: "Multi GPU",
	},
	{
		title: "Fast Storage",
		description:
			"High-bandwidth NVMe storage optimized for training data. Local SSD for maximum IOPS.",
		iconSrc: "/images/main-page/service-home-gpu-3.svg",
		iconAlt: "Fast storage",
	},
	{
		title: "Spot Instances",
		description:
			"Save up to 90% with spot instances for fault-tolerant workloads. Automatic checkpointing included.",
		iconSrc: "/images/main-page/service-home-gpu-4.svg",
		iconAlt: "Spot instances",
	},
	{
		title: "Pre-configured Environments",
		description:
			"Start faster with pre-installed CUDA, cuDNN, PyTorch, TensorFlow, and other ML frameworks.",
		iconSrc: "/images/main-page/service-home-gpu-5.svg",
		iconAlt: "Preconfigured environments",
	},
];

const plans = [
    {
        badge: "New",
        badgePlacement: "outside",
        title: "Basic",
        description:
            "With OVHcloud, you can rely on our expertise in bare-metal technology. Host your website, deploy your high-resilience infrastructure, or customise your machine to suit your projects in just a few clicks.",
        features: ["1-4 vCPU core", "2-8 GB RAM", "50-200 GB NVMe disk space", "4 TB bandwidth"],
    },
    {
        badge: "Most Recommended",
        badgePlacement: "inside",
        title: "General Use",
        description:
            "For growing teams and production workloads. With OVHcloud, you can rely on our expertise in bare-metal technology. Host your website, deploy your high-resilience infrastructure, or customise your machine in just a few clicks.",
        features: ["4-16 vCPU cores", "8-32 GB RAM", "200-400 GB NVMe disk space", "16 TB bandwidth"],
    },
    {
        badge: "Most Scalable",
        badgePlacement: "inside",
        title: "High Performance",
        description:
            "For organizations with advanced needs. With OVHcloud, you can rely on our expertise in bare-metal technology. Host your website, deploy your high-resilience infrastructure, or customise your machine to suit your projects in just a few clicks.",
        features: ["16-64 vCPU cores", "32-256 GB RAM", "400-1000 GB NVMe disk space", "32 TB bandwidth"],
    },
];

 const cases = [
    {
      title: "AI/ML Training",
      description:
        "Train large language models and deep learning networks with high-performance GPU clusters.",
    },
    {
      title: "Inference at Scale",
      description:
        "Deploy ML models for real-time inference with auto-scaling based on request volume.",
    },
    {
      title: "3D Rendering",
      description:
        "Render complex 3D scenes and animations with professional-grade GPU acceleration.",
    },
    {
      title: "Scientific Computing",
      description:
        "Run simulations, molecular dynamics, and other HPC workloads with GPU acceleration.",
    },
  ];
  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="High Performance Computing"
        title="GPU instance"
        description="High-performance GPU computing for AI training, rendering, and scientific computing. Access the latest NVIDIA hardware on demand."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/service-home-gpu-section-1.svg", alt: "GPU infrastructure" }}
      />
      <div className="relative z-20 -mt-6 sm:-mt-18 lg:-mt-20">
        <ComputeMarqueeSection />
        <div className="relative z-10 -mt-16 sm:-mt-20 lg:-mt-28">
          <ComputeFeaturesCurveSection
            backgroundImage="/images/compute-page/curve-feature-section-bg.png"
            curveImage="/images/main-page/service-home-gpu-section-3.png"
          />
        </div>
      </div>
      <ServicesHomeSectionFour plans={plans}/>
      <ServicesHomeSectionSix cases={cases}/>
    </main>
  );
};

export default GpuHome;
