import { ServiceHeroSection } from "@/components/services/service-hero-section";
import ServicesHomeSectionTwo from "@/components/serviceshome/section-2";
import ServicesHomeSectionFour from "@/components/serviceshome/section-4";

const defaultItems = [
	{
		title: "Multiple Database Engines",
		description:
			"Access NVIDIA H100, A100, and RTX 4090 GPUs for maximum performance. Updated regularly with the latest hardware.",
		iconSrc: "/images/main-page/service-home-db-1.svg",
		iconAlt: "GPU hardware",
	},
	{
		title: "Automatic Backups",
		description:
			"Scale from single GPU to multi-node clusters with NVLink interconnect for distributed training workloads.",
		iconSrc: "/images/main-page/service-home-db-2.svg",
		iconAlt: "Multi GPU",
	},
	{
		title: "High Availability",
		description:
			"High-bandwidth NVMe storage optimized for training data. Local SSD for maximum IOPS.",
		iconSrc: "/images/main-page/service-home-db-3.svg",
		iconAlt: "Fast storage",
	},
	{
		title: "Connection Pooling",
		description:
			"Save up to 90% with spot instances for fault-tolerant workloads. Automatic checkpointing included.",
		iconSrc: "/images/main-page/service-home-db-4.svg",
		iconAlt: "Spot instances",
	},
	{
		title: "Performance Insights",
		description:
			"Start faster with pre-installed CUDA, cuDNN, PyTorch, TensorFlow, and other ML frameworks.",
		iconSrc: "/images/main-page/service-home-db-5.svg",
		iconAlt: "Preconfigured environments",
	},
];

const DatabaseHome = () => {
  return (
    <main className="bg-black">
      <ServiceHeroSection
        badge="Managed Database Platform"
        title="Database"
        description="Provision secure, high-availability databases with automated backups, scaling, and monitoring. Deploy in minutes with optimized performance."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/hero-bg.png", alt: "" }}
        illustration={{ src: "/images/Features/database.png", alt: "Database cluster" }}
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

export default DatabaseHome;
