import { ServiceHeroSection } from "@/components/services/service-hero-section";
import KubernetesReleaseSection from "@/components/services/kubernetes-release-section";
import KubernetesFeaturesSection from "@/components/services/kubernetes-features-section";
import KubernetesPricingSection from "@/components/services/kubernetes-pricing-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix from "@/components/serviceshome/section-6";
import { getKubernetesCategories } from "@/lib/helpers/kubernetes-categories";

const KubernetesPage = async () => {
  // Fetch dynamic kubernetes categories from database
  const categories = await getKubernetesCategories();
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
    <main className="bg-[#0E0F0F]">
      <ServiceHeroSection
        badge="High Performance Computing"
        title="Kubernetes Cluster"
        description="Enterprise-grade Kubernetes clusters with automatic scaling, seamless updates, and built-in security. Deploy containerized applications at any scale."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/kubernetes.png", alt: "Kubernetes infrastructure" }}
      />
      <KubernetesReleaseSection />
      <KubernetesFeaturesSection />
      <KubernetesPricingSection categories={categories || undefined} />
      <ServicesHomeSectionFive />
      <ServicesHomeSectionSix cases={cases} />
    </main>
  );
};

export default KubernetesPage;
