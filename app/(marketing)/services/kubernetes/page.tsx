import ComputeFeaturesCurveSection from "@/components/services/compute-features-curve-section";
import ComputeMarqueeSection from "@/components/services/compute-marquee-section";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
// import ServicesHomeSectionFour from "@/components/serviceshome/section-4";
import ServicesHomeSectionFour2 from "@/components/serviceshome/section-4.2";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";

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

// plans removed (unused) to satisfy linter

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
        title="Kubernetes Cluster"
        description="Enterprise-grade Kubernetes clusters with automatic scaling, seamless updates, and built-in security. Deploy containerized applications at any scale."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/kubernetes.svg", alt: "Kubernetes infrastructure" }}
      />
      <div className="relative z-20 -mt-6 sm:-mt-18 lg:-mt-20">
        <ComputeMarqueeSection />
        <div className="relative z-10 -mt-16 sm:-mt-20 lg:-mt-28">
          <ComputeFeaturesCurveSection
            backgroundImage="/images/compute-page/curve-feature-section-bg.png"
            curveImage="/images/main-page/service-home-kubernetes-section-3.png"
          />
        </div>
      </div>
      <ServicesHomeSectionFour2/>
      <ServicesHomeSectionFive/>
      <ServicesHomeSectionSix cases={cases}/>
    </main>
  );
};

export default GpuHome;
