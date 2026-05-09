import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const SolutionsKubernetesPage = () => {
  const buildItems = [
    {
      title: "Managed Kubernetes clusters",
      description:
        "Production-ready K8s with automated upgrades, node pools, and built-in high availability.",
    },
    {
      title: "Auto-scaling node pools",
      description:
        "Scale worker nodes up and down based on workload demand with cluster autoscaler.",
    },
    {
      title: "GitOps deployments",
      description:
        "Declarative deployments with Flux or ArgoCD integration for consistent, auditable releases.",
    },
    {
      title: "Service mesh & networking",
      description:
        "Built-in service mesh with mTLS, traffic splitting, canary deployments, and circuit breakers.",
    },
    {
      title: "Observability stack",
      description:
        "Integrated metrics, logs, and traces with Prometheus, Grafana, and distributed tracing.",
    },
    {
      title: "Multi-environment support",
      description:
        "Dev, staging, and production clusters with namespace isolation and resource quotas.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Microservices Platform with 50+ Services on Kubernetes",
    description:
      "A fintech platform migrates 50+ microservices to managed Kubernetes, reducing deployment time from hours to minutes.",
    environments: [
      {
        title: "Orchestration",
        items: [
          "K8s Ultra (5 nodes, 16 vCPU / 64GB each)",
          "App Deployment Pro for CI/CD",
          "Service mesh with canary deployments",
        ],
      },
      {
        title: "Supporting Services",
        items: [
          "DB High Performance for stateful services",
          "Object Storage for artifacts & logs",
          "Security Pro with pod security policies",
        ],
      },
    ],
    tags: ["Kubernetes", "App Deploy", "Database", "Security", "Storage"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "#what-you-can-build", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to go cloud-native?",
    description:
      "Get architecture guidance for Kubernetes platforms. Plans and pricing available in the dashboard.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your K8s workload...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
    consultationService: "Cloud-Native Kubernetes",
  };

  return (
    <main className="bg-[#0E0F0F]">
      <SolutionsHeroSection
        badge={["Managed K8s", "Auto Scaling", "Service Mesh", "GitOps"]}
        title="Cloud-Native Kubernetes Platforms Infrastructure"
        description="Run microservices at scale with managed Kubernetes, automated deployments, service mesh, observability, and modern delivery practices."
        primaryAction={{ label: "Explore Capabilities", href: "#what-you-can-build" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-kubernetes.png", alt: "Kubernetes infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default SolutionsKubernetesPage;
