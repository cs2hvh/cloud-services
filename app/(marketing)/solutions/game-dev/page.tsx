import { SolutionsHeroSection } from "@/components/solutions/sections/hero-section";
import { WhatYouCanBuild } from "@/components/solutions/sections/what-you-can-build";
import { ReferenceDeployment } from "@/components/solutions/sections/reference-deployment";
import { ReadyToBuild } from "@/components/solutions/sections/ready-to-build";

const GameDevPage = () => {

  const buildItems = [
    {
      title: "Dedicated game servers",
      description:
        "High-frequency compute instances optimized for real-time multiplayer with sub-10ms tick rates.",
    },
    {
      title: "Burst scaling for launches",
      description:
        "Auto-scale server fleets for game launches, events, and peak hours without pre-provisioning.",
    },
    {
      title: "Asset pipeline storage",
      description:
        "Store game builds, textures, models, and patches in S3-compatible storage with CDN delivery.",
    },
    {
      title: "Player data & leaderboards",
      description:
        "Managed databases with low-latency reads for player profiles, inventory, and ranking systems.",
    },
    {
      title: "DDoS-protected networking",
      description:
        "Layer 3-7 DDoS protection to keep game servers online during attacks.",
    },
    {
      title: "Container orchestration",
      description:
        "Run game server pods on managed Kubernetes with auto-scaling node pools and rolling updates.",
    },
  ];

  const referenceDeploymentData = {
    badge: "Reference Deployment",
    title: "Example: Multiplayer Game Backend Serving 200K Concurrent Players",
    description:
      "A game studio launches a competitive multiplayer title with dedicated server hosting across 6 regions, serving 200K concurrent players at peak.",
    environments: [
      {
        title: "Game Servers",
        items: [
          "Compute Ultra for dedicated game instances",
          "400 Gbps server fleet orchestration",
          "DDoS protection at all endpoints",
        ],
      },
      {
        title: "Backend Services",
        items: [
          "DB High Performance for player data",
          "Object Storage Pro for game assets & patches",
          "Security Pro to prevent network threats",
        ],
      },
    ],
    tags: ["Compute", "Kubernetes", "Database", "Object Storage", "Security"],
    actions: [
      { label: "Build similar architecture", href: "/signup", variant: "primary" as const },
      { label: "Explore capabilities", href: "#what-you-can-build", variant: "link" as const },
    ],
  };

  const readyToBuildData = {
    title: "Ready to launch your game?",
    description:
      "Get architecture guidance for game server hosting. Plans and pricing available in the dashboard.",
    formFields: [
      { name: "fullName", placeholder: "Full Name", type: "text" as const },
      { name: "workEmail", placeholder: "Work Email", type: "email" as const },
      { name: "workload", placeholder: "Tell us about your 3D workload...", type: "textarea" as const },
    ],
    buttonText: "Request Consultation",
    consultationService: "Game Development & Hosting",
  };
  return (
    <main className="bg-[#0E0F0F]">
      <SolutionsHeroSection
        badge={["Low Latency", "Game Servers", "Asset Storage", "Burst Scale"]}
        title="Game Development & Hosting Infrastructure"
        description="Build and host multiplayer game servers with low-latency networking, GPU-accelerated rendering, scalable backends, and massive asset storage."
        primaryAction={{ label: "Explore Capabilities", href: "#what-you-can-build" }}
        secondaryAction={{ label: "View Customer Sales", href: "/docs" }}
         backgroundImage={{ src: "/images/hero/service-hero-bg.png", alt: "" }}
        illustration={{ src: "/images/main-page/solution-home-web-host.png", alt: "Game Development infrastructure" }}
      />
      <WhatYouCanBuild items={buildItems} />
      <ReferenceDeployment {...referenceDeploymentData} />
      <ReadyToBuild {...readyToBuildData} />
    </main>
  );
};

export default GameDevPage;
