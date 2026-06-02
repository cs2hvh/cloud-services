import { assetUrl } from "@/lib/asset-url";
import { ServiceHeroSection } from "@/components/services/service-hero-section";
import KubernetesReleaseSection from "@/components/services/kubernetes-release-section";
import KubernetesFeaturesSection from "@/components/services/kubernetes-features-section";
import KubernetesPricingSection from "@/components/services/kubernetes-pricing-section";
import ServicesHomeSectionFive from "@/components/serviceshome/section-5";
import ServicesHomeSectionSix, {
  type UseCase,
} from "@/components/serviceshome/section-6";
import { getKubernetesCategories } from "@/lib/helpers/kubernetes-categories";
import Image from "next/image";

const CDN = "https://ahurasense.cs2hvh.com/images/2026-06";

const KubernetesPage = async () => {
  const categories = await getKubernetesCategories();

  const cases: UseCase[] = [
    {
      iconNode: <Image src={`${CDN}/Ome-MzN09ykb.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      metric: "Microservices",
      title: "Microservices and APIs",
      description:
        "Run dozens of services on one cluster with namespace isolation, mTLS via a service mesh, and HPA based on request volume.",
    },
    {
      iconNode: <Image src={`${CDN}/T8k0Ylj2ere9.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      metric: "AI / ML",
      title: "Training and inference at scale",
      description:
        "GPU node pools with CUDA preinstalled, spot pricing for training, and warm pools to keep inference latency predictable.",
    },
    {
      iconNode: <Image src={`${CDN}/Ro-vKuEy9kks.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      metric: "Platform teams",
      title: "Internal developer platforms",
      description:
        "Multi-tenant clusters with RBAC, network policies, and per-namespace quotas. Argo CD or Flux wired in from day one.",
    },
    {
      iconNode: <Image src={`${CDN}/FiShhqQFLbPW.png`} alt="" width={44} height={44} className="h-11 w-11 object-contain" />,
      metric: "Regulated",
      title: "Compliance-bound workloads",
      description:
        "Private clusters, BYOK encryption, audit logs to S3 or Loki, and SOC 2 controls — for workloads with an audit trail.",
    },
  ];

  const faqs = [
    {
      question: "Is the control plane really free?",
      answer:
        "Yes. The API server, etcd, scheduler, and controller-manager are managed and billed by us — you only pay for worker nodes you provision.",
    },
    {
      question: "Which Kubernetes versions are supported?",
      answer:
        "We track upstream Kubernetes and ship the last three minor versions. Patch releases land within 24 hours of upstream GA, with zero-downtime control-plane upgrades.",
    },
    {
      question: "Do you support GitOps?",
      answer:
        "Yes. Argo CD and Flux are installable from the dashboard in one click, with per-branch environment wiring and drift reconciliation enabled by default.",
    },
    {
      question: "Can I run GPU workloads?",
      answer:
        "Yes. GPU clusters come with the NVIDIA GPU Operator preinstalled, CUDA and cuDNN drivers ready, and A100 / H100 on-demand and spot node pools available.",
    },
    {
      question: "How does autoscaling work?",
      answer:
        "Cluster autoscaler scales node pools on pending pods and CPU pressure. Pods scale via HPA, VPA, and KEDA. Idle node pools scale to zero on a schedule you control.",
    },
    {
      question: "What about multi-region or multi-zone HA?",
      answer:
        "Production HA clusters stretch the control plane across 3 zones with quorum etcd. Workers can be pinned to zones via topology-aware scheduling and pod disruption budgets.",
    },
  ];

  return (
    <main className="bg-[#0D0D0F]">
      <ServiceHeroSection
        badge="Managed Kubernetes"
        title="Kubernetes Cluster"
        description="Production Kubernetes clusters with a free managed control plane, multi-zone HA, autoscaling node pools, and GitOps wired in from the first push."
        primaryAction={{ label: "Get Started", href: "/signup" }}
        secondaryAction={{ label: "View Documentation", href: "/docs" }}
        backgroundImage={{ src: assetUrl("/images/hero/service-hero-bg.png"), alt: "" }}
        illustration={{ src: assetUrl("/images/main-page/kubernetes.png"), alt: "Kubernetes infrastructure" }}
      />
      <KubernetesReleaseSection />
      <KubernetesFeaturesSection />
      <KubernetesPricingSection categories={categories || undefined} />
      <ServicesHomeSectionFive title="Frequently asked questions" faqs={faqs} />
      <ServicesHomeSectionSix
        cases={cases}
        eyebrow="Use cases"
        heading="Built for"
        headingAccent="every workload."
        subtitle="From microservices to GPU training — one platform, ready for every production workload."
      />
    </main>
  );
};

export default KubernetesPage;
