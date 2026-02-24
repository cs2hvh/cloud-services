import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const WebHostingPage = () => {

  const buildItems = [
    {
      title: "Zero-downtime deployments",
      description:
        "Ship updates with blue-green deployments, rollbacks, and preview environments built in.",
    },
    {
      title: "Autoscale on demands",
      description:
        "Handle traffic spikes automatically with horizontal scaling and load balancing.",
    },
    {
      title: "Git-integrated CI/CD",
      description:
        "Push to deploy with integrated build pipelines and environment-based workflows.",
    },
    {
      title: "SSL & security defaults",
      description:
        "Free SSL certificates, WAF rules, and DDoS protection on every deployment.",
    },
    {
      title: "Global edge delivery",
      description:
        "Serve static assets and API responses from edge locations worldwide.",
    },
    {
      title: "Managed databases",
      description:
        "Serve static assets and API responses from edge locations worldwide.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Scaling a Multi-Tenant SaaS to 100K Users",
    description:
      "A B2B SaaS company migrates from shared hosting to a production-grade cloud setup serving 100K active users with 99.99% uptime.",
    environments: [
      {
        title: "Application Layer",
        items: [
         "GPU Pro (A100 class) for fine-tuning",
         "1TB Object Storage for datasets",
         "Managed DB High Performance for metadata"
        ],
      },
      {
        title: "Data & Security",
        items: [
         "DB High Performance with read replicas",
         "Object Storage for user uploads",
         "Security Pro with WAF + bot protection"
        ],
      },
    ],
    tags: ["Compute", "App-deploy", "Database", "Object-storage", "Security"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "/docs", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to build with SaaS?",
    description:
      "Get architecture guidance for your web application. Plans and pricing available in the dashboard.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your AI workload...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
  };
  return (
    <main className="bg-black">
      <SolutionsHeroSection
        badge={["Auto Deploy", "CI/CD Pipelines", "Managed DB", "Global CDN"]}
        title="Web Hosting & SaaS Deployment Infrastructure"
        description="Launch modern web applications and SaaS platforms with reliable compute, managed databases, CI/CD pipelines, and enterprise-grade security."
        primaryAction={{ label: "Explore Capabilities", href: "/signup" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-web-host.svg", alt: "Web Hosting & SaaS Deployment Infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default WebHostingPage;
