import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const EcommercePage = () => {

  const buildItems = [
    {
      title: "Sub-second page loads",
      description:
        "Serve storefront pages from edge caches with optimized assets and delivery at every network layer.",
    },
    {
      title: "Resilient checkout flows",
      description:
        "Handle flash sales and traffic spikes with autoscaling compute and resilient load balancing.",
    },
    {
      title: "Secure payment processing",
      description:
        "PCI-compliant infrastructure, secure API, encryption at rest, and isolated network boundaries.",
    },
    {
      title: "Product media storage",
      description:
        "Store terabytes of product images and videos with on-demand image transforms and CDN delivery.",
    },
    {
      title: "Real-time inventory",
      description:
        "Managed databases with high-availability and replication for orders and inventory data.",
    },
    {
      title: "Analytics & personalization",
      description:
        "Analyze customer behavior with ML and real-time personalization at scale.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: High-Traffic Ecommerce Platform Handling 10K Orders/Hour",
    description:
      "A fast-growing DTC brand scaled their storefront to handle Black Friday traffic spikes. Their architecture spans edge CDN to secure checkout flows.",
    environments: [
      {
        title: "Storefront & APIs",
        items: [
          "Compute Pro (8 vCPU, 16GB) x4 primary",
          "Kubernetes (Managed) for microservices",
          "Object Storage (Pro) for media CDN",
        ],
      },
      {
        title: "Data & Security",
        items: [
          "Managed DB Pro with read replicas",
          "Object Storage (Pro) for backup/audit",
          "Security Pro with WAF + DDoS",
        ],
      },
    ],
    tags: ["Compute", "Kubernetes", "Object Storage", "Managed Database", "Security"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "/docs", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to scale your store?",
    description:
      "Plans and pricing live inside the dashboard. Reach out for architecture guidance and enterprise support.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your ecommerce needs...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
  };
  return (
    <main className="bg-[#0E0F0F]">
      <SolutionsHeroSection
        badge={["High Availability", "Secure Checkout", "Big CDN", "PCI Ready"]}
        title="Ecommerce Infrastructure"
        description="Deliver blazing-fast storefronts, resilient checkout flows, and secure payment processing with scalable cloud infrastructure designed for commerce."
        primaryAction={{ label: "Explore Capabilities", href: "/signup" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-ecom.png", alt: "Ecommerce infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default EcommercePage;
