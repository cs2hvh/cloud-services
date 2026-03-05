import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const SolutionsStoragePage = () => {
  const buildItems = [
    {
      title: "S3-compatible object storage",
      description:
        "Drop-in replacement for AWS S3 with full API compatibility for existing tools and SDKs.",
    },
    {
      title: "Automated backup schedules",
      description:
        "Set up automated snapshots for databases, volumes, and object stores with configurable retention.",
    },
    {
      title: "Cross-region replication",
      description:
        "Replicate critical data across geographic regions for disaster recovery and compliance.",
    },
    {
      title: "CDN-integrated delivery",
      description:
        "Serve static assets, media files, and downloads from global edge locations with built-in CDN.",
    },
    {
      title: "Lifecycle management",
      description:
        "Automate data tiering, expiration, and archival with configurable lifecycle policies.",
    },
    {
      title: "Immutable backups",
      description:
        "Write-once read-many storage for compliance, audit trails, and ransomware protection.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Media Platform Storing 500TB with Global Delivery",
    description:
      "A media company builds a content delivery pipeline storing 500TB of video assets with global CDN delivery and 99.999% durability.",
    environments: [
      {
        title: "Storage Layer",
        items: [
          "Object Ultra (500TB primary, multi-region)",
          "CDN delivery with edge caching",
          "Lifecycle policies for archival tiers",
        ],
      },
      {
        title: "Backup & Security",
        items: [
          "DB Enterprise with daily + PITR backups",
          "Security Pro with access controls",
          "Compliance features with immutability enabled",
        ],
      },
    ],
    tags: ["Object Storage", "Database", "Security", "Compute", "CDN"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "/docs", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to secure your data?",
    description:
      "Get expert guidance on storage architecture. Plans and pricing available in the dashboard.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your storage needs...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
  };

  return (
    <main className="bg-[#0E0F0F]">
      <SolutionsHeroSection
        badge={["S3 Compatible", "Auto Backup", "CDN Delivery", "Lifecycle Rules"]}
        title="Storage & Backup Solutions Infrastructure"
        description="Store and protect critical data with S3-compatible object storage, automated backups, lifecycle policies, and cross-region replication."
        primaryAction={{ label: "Explore Capabilities", href: "/signup" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
        backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-storage.png", alt: "Storage infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default SolutionsStoragePage;
