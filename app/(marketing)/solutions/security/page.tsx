import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const SolutionsSecurityPage = () => {
  const buildItems = [
    {
      title: "Zero-trust architecture",
      description:
        "Enforce least privilege access with identity-aware proxies, mTLS, and service mesh policies.",
    },
    {
      title: "Advanced WAF & DDoS",
      description:
        "Layer 3-7 DDoS mitigation, web application firewall, and bot management for all endpoints.",
    },
    {
      title: "Network segmentation",
      description:
        "VPC isolation, private subnets, security groups, and microsegmentation for workload boundaries.",
    },
    {
      title: "Compliance automation",
      description:
        "Pre-built controls for SOC 2, HIPAA, and PCI DSS with continuous compliance monitoring.",
    },
    {
      title: "SIEM & audit logging",
      description:
        "Centralized security event management with immutable audit trails and real-time alerting.",
    },
    {
      title: "Identity & access management",
      description:
        "SSO, MFA, role-based access, and fine-grained IAM policies across all resources.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Enterprise Migration with Full Compliance Stack",
    description:
      "A healthcare SaaS company migrates to cloud with HIPAA-compliant infrastructure, achieving SOC 2 certification in 90 days.",
    environments: [
      {
        title: "Security Controls",
        items: [
          "WAF Pro with managed Cloud audit rules",
          "Zero-trust proxies with mTLS",
          "SIEM integration with security center",
        ],
      },
      {
        title: "Infrastructure",
        items: [
          "Multi-region, security-defined",
          "DB Enterprise with encryption at rest",
          "Object Storage with audit logging + WORM",
        ],
      },
    ],
    tags: ["Security", "Kubernetes", "Database", "Object Storage", "IAM"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "/docs", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to secure your cloud?",
    description:
      "Get expert guidance on enterprise security architecture. Compliance-ready infrastructure available today.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your security needs...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
  };

  return (
    <main className="bg-black">
      <SolutionsHeroSection
        badge={["Zero Trust", "WAF & DDoS", "Compliance", "SOC2/ISO/GDPR"]}
        title="Secure Enterprise Cloud Infrastructure"
        description="Harden your cloud workloads with zero-trust security, identity controls, network segmentation, compliance automation, and defense-in-depth architecture."
        primaryAction={{ label: "Explore Capabilities", href: "/signup" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-security.svg", alt: "Security infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default SolutionsSecurityPage;
