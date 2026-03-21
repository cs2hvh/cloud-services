import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const AiMlPage = () => {

  const buildItems = [
    {
      title: "Train & fine-tune models",
      description:
        "Spin up GPU clusters for deep learning, training, fine-tuning, and experimentation.",
    },
    {
      title: "Train & fine-tune models",
      description:
        "Spin up GPU configurations for deep learning, training, fine-tuning, and experimentation.",
    },
    {
      title: "Train & fine-tune models",
      description:
        "Spin up GPU infrastructure for deep learning, training, fine-tuning, and experimentation.",
    },
    {
      title: "Train & fine-tune models",
      description:
        "Run on GPU-based instances for deep learning, training, fine-tuning, and experimentation.",
    },
    {
      title: "Train & fine-tune models",
      description:
        "Spin up GPU hardware for deep learning, training, fine-tuning, and experimentation.",
    },
    {
      title: "Train & fine-tune models",
      description:
        "Spin up GPU-backed instances for deep learning, training, fine-tuning, and experimentation.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Building a Production LLM Inference Platform",
    description:
      "A startup deploys an AI-powered knowledge assistant serving 50K+ daily users. The stack is designed for training, fine-tuning, and high-availability inference.",
    environments: [
      {
        title: "Training Environment",
        items: [
          "GPU Pro (A100 class) for fine-tuning",
          "1TB Object Storage for datasets",
          "Managed DB High Performance for metadata",
        ],
      },
      {
        title: "Inference & Production",
        items: [
          "Managed Kubernetes (Pro) for autoscaling",
          "Application Deployment (Pro) for CI/CD",
          "Security Pro with WAF + DDoS",
        ],
      },
    ],
    tags: ["GPU Pro", "Object Storage", "Kubernetes", "Managed Database", "Security"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "/docs", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to build with AI?",
    description:
      "Plans and pricing live inside the dashboard. Reach out for architecture guidance and enterprise support.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your AI workload...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
    consultationService: "AI & ML",
  };
  return (
    <main  style={{backgroundColor:"#0E0F0F"}} >
      <SolutionsHeroSection
        badge={["GPU Training", "Inference APIs", "LLM Fine-tuning", "Secure Cloud"]}
        title="AI Machine Learning"
        description="Build intelligent applications with GPU acceleration, scalable compute, secure storage, and API-first AI agents. Everything is production-ready — pricing and plans are managed directly in your dashboard."
        primaryAction={{ label: "Explore Capabilities", href: "/signup" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-ai.png", alt: "AI Machine Learning infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} horizontal={true} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default AiMlPage;
