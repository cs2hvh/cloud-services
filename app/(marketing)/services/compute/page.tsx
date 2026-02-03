import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionTwo from "@/components/serviceshome/section-2";
import ServicesHomeSectionFour from "@/components/serviceshome/section-4";


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
      <ServicesHomeSectionTwo 
        badge='Features' 
        title = "Powerful Capabilities" 
        description="Explore the robust features that empower your cloud infrastructure." 
        items={defaultItems} backgroundImage="/images/main-page/everything-sec-bg.svg" />
        <ServicesHomeSectionFour/>
    </main>
  );
};

export default ComputeHome;
