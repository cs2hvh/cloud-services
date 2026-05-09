import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const SolutionsDatabasePage = () => {

  const buildItems = [
    {
      title: "Fully managed databases",
      description:
        "PostgreSQL, MySQL with automated patching, upgrades, and health monitoring out of the box.",
    },
    {
      title: "Automated backup & recovery",
      description:
        "Daily snapshots, point-in-time recovery, and cross-region backup replication for disaster recovery.",
    },
    {
      title: "Read replicas for scale",
      description:
        "Add read replicas for database read load and serve analytics workloads without impacting production.",
    },
    {
      title: "High availability clusters",
      description:
        "Multi-zone database deployments with automatic failover and zero-downtime maintenance windows.",
    },
    {
      title: "Secure data access",
      description:
        "VPC peering, private networking, encryption at rest, access control, and audit logging.",
    },
    {
      title: "Performance monitoring",
      description:
        "Query insights, slow query logs, connection pooling, and real-time query dashboards.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Real-Time Analytics Platform Processing 1B Events/Day",
    description:
      "A fintech company builds a real-time analytics platform processing 1 billion events daily with sub-second query response times.",
    environments: [
      {
        title: "Database Tier",
        items: [
          "DB Extreme (96 vCPU, 1.5TB) primary",
          "12 Read replicas for analytics pipeline",
          "RPO < 1 second with replication",
        ],
      },
      {
        title: "Application & Security",
        items: [
          "Compute Performance for application servers",
          "Object Storage for data lake exports",
          "Security Pro with audit logging",
        ],
      },
    ],
    tags: ["Database", "Compute", "Object Storage", "Security", "Monitoring"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "#what-you-can-build", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to build with managed databases?",
    description:
      "Get expert guidance on database architecture. Plans and pricing available in the dashboard.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your database needs...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
    consultationService: "Managed Databases",
  };

  return (
    <main className="bg-[#0E0F0F]">
      <SolutionsHeroSection
        badge={["Managed DB", "Auto Backup", "Read Replicas", "High Availability"]}
        title="Database-Driven Applications Infrastructure"
        description="Build data-intensive applications with managed databases, automated backups, read replicas, and secure networking for maximum reliability."
        primaryAction={{ label: "Explore Capabilities", href: "#what-you-can-build" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/service-home-db-section-1.png", alt: "Database infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default SolutionsDatabasePage;
