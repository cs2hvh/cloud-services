import { Suspense } from "react";
import { getFullPricingData, type ServiceCategory } from "@/lib/supabase/queries/pricing";
import PricingClient from "@/components/pricing/pricing-client"

// Fallback static data - used when database has no pricing data yet
//pushing new changes-changes
const FALLBACK_PRICING_DATA: ServiceCategory[] = [
  {
    id: "compute",
    label: "Compute",
    description:
      "General-purpose instances for web apps, APIs, workers, and backend services.",
    tiers: [
      {
        id: "balanced",
        name: "Balanced",
        shortDescription:
          "Typical production workloads — backend services, web apps, and CI runners.",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["8 vCPU", "32GB DDR5", "400GB NVMe", "5 Gbit/s"],
        features: [
          "Best value",
          "Easy scaling",
          "Reliable throughput",
          "Great for web dev",
          "Root access",
          "Snapshots",
          "Firewall",
          "Monitoring",
          "Private networking",
          "IPv6 support",
          "Cloud-init support",
          "SSH key management",
        ],
        summary: {
          billing: "Yearly",
          support: "Standard",
          provisioning: "Instant",
          guarantee: "60 Days",
          buttonText: "Create VM",
        },
        highlighted: true,
        isFeatured: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        id: "enterprise-ultra",
        name: "Enterprise/Ultra",
        shortDescription: "High-performance compute for demanding workloads",
        price: { monthly: 199, yearly: 2388 },
        billingPeriod: "per month billed yearly",
        features: [
          "Dedicated resources",
          "Highest throughput",
          "Priority support",
        ],
        ctaText: "Create VM",
        ctaLink: "/signup",
      },
      {
        id: "performance",
        name: "Performance",
        shortDescription: "Optimized for production apps and game servers",
        price: { monthly: 149, yearly: 1788 },
        billingPeriod: "per month billed yearly",
        specs: ["12 vCPU", "48 GB DDR5", "600GB NVMe", "10 Gbit/s"],
        features: [
          "Root access",
          "Private networking",
          "Monitoring",
          "DDoS baseline",
          "One-click resize",
          "Snapshots",
          "Firewall",
          "API access",
          "IPv6 support",
          "Simple image marketplace",
        ],
        summary: {
          billing: "Yearly",
          support: "Standard",
          provisioning: "Instant",
          guarantee: "60 Days",
          buttonText: "Create VM",
        },
        ctaText: "Create VM",
        ctaLink: "/signup",
      },
      {
        id: "standard",
        name: "Standard",
        shortDescription: "Everyday workloads",
        price: { monthly: 39, yearly: 468 },
        billingPeriod: "per month billed yearly",
        features: ["Reliable compute", "Balanced memory", "SSD storage"],
        ctaText: "Create VM",
        ctaLink: "/signup",
      },
      {
        id: "starter",
        name: "Starter",
        shortDescription: "Pocket-friendly starter",
        price: { monthly: 9, yearly: 108 },
        billingPeriod: "per month billed yearly",
        features: ["Starter resources", "Low-cost entry"],
        ctaText: "Create VM",
        ctaLink: "/signup",
      },
    ],
  },
  {
    id: "gpu-instance",
    label: "GPU Instances",
    description:
      "On-demand NVIDIA GPUs for training, fine-tuning, and inference. Per-second billing, no commitments.",
    tiers: [
      {
        id: "gpu-h200-sxm",
        name: "H200 SXM",
        machineType: "H200 SXM",
        shortDescription: "141 GB HBM3e. Long-context training and high-throughput serving.",
        price: { monthly: 2872, yearly: 34465 },
        billingPeriod: "per GPU, billed per second",
        specs: ["24 vCPU", "200 GB RAM", "1.6 TB NVMe", "200 Gbit/s"],
        features: [
          "141 GB HBM3e",
          "Hopper architecture",
          "CUDA + drivers managed",
          "Private networking",
        ],
        ctaText: "Deploy",
        ctaLink: "/dashboard/services/gpu/deploy?gpu=h200-141",
      },
      {
        id: "gpu-b200",
        name: "B200",
        machineType: "B200",
        shortDescription: "192 GB HBM3e flagship. Frontier-scale training and inference.",
        price: { monthly: 3953, yearly: 47434 },
        billingPeriod: "per GPU, billed per second",
        specs: ["28 vCPU", "256 GB RAM", "2 TB NVMe", "400 Gbit/s"],
        features: [
          "192 GB HBM3e",
          "Blackwell architecture",
          "CUDA + drivers managed",
          "Private networking",
        ],
        highlighted: true,
        isFeatured: true,
        ctaText: "Deploy",
        ctaLink: "/dashboard/services/gpu/deploy?gpu=b200-180",
      },
      {
        id: "gpu-b200-x4",
        name: "B200 ×4",
        machineType: "B200 X4",
        shortDescription: "4× B200 with NVLink. Multi-GPU training out of the box.",
        price: { monthly: 15811, yearly: 189734 },
        billingPeriod: "per node, billed per second",
        specs: ["112 vCPU", "1 TB RAM", "8 TB NVMe", "400 Gbit/s"],
        features: [
          "4× 192 GB HBM3e",
          "NVLink interconnect",
          "Multi-node ready",
          "Priority support",
        ],
        ctaText: "Deploy",
        ctaLink: "/dashboard/services/gpu/deploy?gpu=b200-x4-180",
      },
      {
        id: "gpu-b200-x8",
        name: "B200 ×8",
        machineType: "B200 X8",
        shortDescription: "8× B200 HGX node. Maximum density for the largest models.",
        price: { monthly: 31622, yearly: 379469 },
        billingPeriod: "per node, billed per second",
        specs: ["224 vCPU", "2 TB RAM", "16 TB NVMe", "3.2 Tbit/s"],
        features: [
          "8× 192 GB HBM3e",
          "HGX baseboard · NVLink",
          "Multi-node ready",
          "Priority support",
        ],
        ctaText: "Deploy",
        ctaLink: "/dashboard/services/gpu/deploy?gpu=b200-x8-180",
      },
    ],
  },
  {
    id: "ai-labs",
    label: "A.I. Labs",
    description:
      "Inference, fine-tuning, embeddings, and model hosting behind one API key. Pay per token or per GPU-second — zero markup.",
    tiers: [
      {
        id: "ai-inference",
        name: "Inference API",
        shortDescription: "50+ frontier and open models, OpenAI- and Anthropic-compatible.",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "metered per token",
        features: [
          "Pass-through token pricing",
          "Streaming, tools, vision",
          "BYOK + semantic cache",
          "Zero markup",
        ],
        highlighted: true,
        isFeatured: true,
        ctaText: "Create API key",
        ctaLink: "/signup",
      },
      {
        id: "ai-fine-tuning",
        name: "Fine-Tuning",
        shortDescription: "LoRA training on managed GPUs. From ~$0.10 per run.",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "metered per GPU-second",
        features: [
          "8+ open base models",
          "Automatic eval gate",
          "Live training progress",
          "From $0.10 / run",
        ],
        ctaText: "Start a fine-tune",
        ctaLink: "/signup",
      },
      {
        id: "ai-model-hosting",
        name: "Model Hosting",
        shortDescription: "Your model on a dedicated GPU. Scale-to-zero when idle.",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "per GPU-second",
        features: [
          "Single-tenant GPUs",
          "Bring HF id or Docker image",
          "Autoscale + scale-to-zero",
          "From $0.40 / GPU-hr",
        ],
        ctaText: "Deploy a model",
        ctaLink: "/signup",
      },
      {
        id: "ai-embeddings",
        name: "Embeddings + Vector",
        shortDescription: "Hosted embeddings and managed pgvector collections.",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "metered per token",
        features: [
          "Hosted embedding models",
          "Managed pgvector",
          "One API key",
          "Pass-through pricing",
        ],
        ctaText: "Get started",
        ctaLink: "/signup",
      },
    ],
  },
  {
    id: "object-storage",
    label: "Object Storage",
    description:
      "S3-compatible object storage for backups, media, logs, datasets, and static website hosting.",
    tiers: [
      {
        id: "balanced",
        name: "Balanced",
        shortDescription: "Most popular for products",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["S3 API", "Encryption", "Lifecycle"],
        features: [
          "Great value",
          "Simple integration",
          "Fast",
          "Reliable",
          "S3 API",
          "Encryption",
          "Lifecycle",
          "Signed URLs",
        ],
        summary: {
          billing: "Yearly",
          support: "Standard",
          provisioning: "Instant",
          guarantee: "60 Days",
          buttonText: "Create bucket",
        },
        highlighted: true,
        isFeatured: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
    ],
  },
  {
    id: "database",
    label: "Database",
    description: "Managed database clusters for PostgreSQL, MySQL, and MongoDB.",
    tiers: [
      {
        id: "mysql-basic",
        name: "MySQL Basic",
        subType: "mysql",
        cpuType: "basic",
        price: { monthly: 39, yearly: 468 },
        billingPeriod: "per month",
        features: ["20GB storage", "Single AZ", "Automated patching", "Community support"],
        ctaText: "Start Free",
        ctaLink: "/signup",
      },
      {
        id: "postgres-general",
        name: "PostgreSQL General",
        subType: "postgres",
        cpuType: "general-purpose",
        price: { monthly: 119, yearly: 1428 },
        billingPeriod: "per month",
        features: [
          "80GB storage",
          "Read replicas",
          "Point-in-time recovery",
          "Automated backups",
        ],
        highlighted: true,
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "mongodb-storage",
        name: "MongoDB Storage Optimized",
        subType: "mongodb",
        cpuType: "storage-optimized",
        price: { monthly: 219, yearly: 2628 },
        billingPeriod: "per month",
        features: [
          "500GB storage",
          "IO tuned volumes",
          "Replica set",
          "Cross-region backups",
          "Priority support",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "mysql-storage",
        name: "MySQL Storage Optimized",
        subType: "mysql",
        cpuType: "storage-optimized",
        price: { monthly: 199, yearly: 2388 },
        billingPeriod: "per month",
        features: [
          "400GB storage",
          "High IOPS volume",
          "Point-in-time restore",
          "Read replicas",
          "24/7 monitoring",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "postgres-basic",
        name: "PostgreSQL Basic",
        subType: "postgres",
        cpuType: "basic",
        price: { monthly: 59, yearly: 708 },
        billingPeriod: "per month",
        features: [
          "40GB storage",
          "Single AZ",
          "Automated updates",
          "Daily backups",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "mongodb-general",
        name: "MongoDB General",
        subType: "mongodb",
        cpuType: "general-purpose",
        price: { monthly: 149, yearly: 1788 },
        billingPeriod: "per month",
        features: [
          "120GB storage",
          "Replica set",
          "Automated scaling",
          "Advanced security",
          "Dedicated support",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
    ],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    description: "Managed Kubernetes clusters for container orchestration.",
    tiers: [
      {
        id: "starter-cluster",
        name: "Starter Cluster",
        cpuType: "basic",
        price: { monthly: 49, yearly: 588 },
        billingPeriod: "per cluster/month",
        features: ["3 nodes", "Basic monitoring", "Auto-scaling", "Load balancing"],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "production-cluster",
        name: "Production Cluster",
        cpuType: "general-purpose",
        price: { monthly: 149, yearly: 1788 },
        billingPeriod: "per cluster/month",
        features: [
          "10 nodes",
          "Advanced monitoring",
          "Multi-zone",
          "Automated backups",
          "Service mesh",
        ],
        highlighted: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        id: "storage-optimized-cluster",
        name: "Storage Optimized Cluster",
        cpuType: "storage-optimized",
        price: { monthly: 299, yearly: 3588 },
        billingPeriod: "per cluster/month",
        features: [
          "8 nodes",
          "High IOPS persistent volumes",
          "Automated backups",
          "Stateful workload optimized",
          "Dedicated support",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "enterprise-cluster",
        name: "Enterprise Cluster",
        cpuType: "general-purpose",
        price: { monthly: 499, yearly: 5988 },
        billingPeriod: "per cluster/month",
        features: [
          "Unlimited nodes",
          "Multi-region",
          "Advanced security",
          "Dedicated support",
          "Custom configuration",
        ],
        ctaText: "Contact Sales",
        ctaLink: "/contact",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    description:
      "Protect your workloads with firewalling, WAF, DDoS mitigation, access controls, and audit visibility.",
    tiers: [
      {
        id: "enterprise",
        name: "Enterprise",
        shortDescription: "Full suite of security features for your infrastructure.",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        features: [
          "DDoS baseline protection",
          "Web Application Firewall",
          "Access controls",
          "Audit logs",
        ],
        highlighted: true,
        isFeatured: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
    ],
  },
  {
    id: "app-deployment",
    label: "App Deployment",
    description: "Deploy applications with zero configuration.",
    tiers: [
      {
        id: "hobby",
        name: "Hobby",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Free tier",
        features: ["1 application", "Basic features", "Community support"],
        ctaText: "Start Free",
        ctaLink: "/signup",
      },
      {
        id: "pro",
        name: "Pro",
        price: { monthly: 29, yearly: 348 },
        billingPeriod: "per month",
        features: [
          "10 applications",
          "Custom domains",
          "Auto-deploy",
          "Environment variables",
          "SSL certificates",
        ],
        highlighted: true,
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "team",
        name: "Team",
        price: { monthly: 99, yearly: 1188 },
        billingPeriod: "per month",
        features: [
          "Unlimited applications",
          "Team collaboration",
          "Advanced monitoring",
          "Priority support",
          "Custom integrations",
        ],
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
    ],
  },
];

// Loading skeleton
function PricingLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-[#04060a] text-white">
      <section className="mx-auto w-full max-w-[1240px] px-[clamp(20px,4vw,48px)] pt-28 pb-10 sm:pt-32">
        <div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-5 h-12 w-2/3 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-white/[0.05]" />
        <div className="mt-8 h-10 w-56 animate-pulse rounded-[7px] bg-white/[0.06]" />
      </section>
      <section className="mx-auto w-full max-w-[1240px] px-[clamp(20px,4vw,48px)] pb-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          <aside className="lg:w-52 lg:shrink-0">
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-white/[0.05]" />
              ))}
            </div>
          </aside>
          <div className="flex-1 space-y-4">
            <div className="h-8 w-48 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-64 animate-pulse rounded-[8px] bg-white/[0.04]" />
          </div>
        </div>
      </section>
    </main>
  );
}

async function PricingContent() {
  // Fetch dynamic pricing data from database
  let pricingData = await getFullPricingData();
  //console.log(pricingData,"..................467")

  // Use fallback data if no data in database
  if (!pricingData || pricingData.length === 0) {
    pricingData = FALLBACK_PRICING_DATA;
  } else {
    // Keep GPU pricing static from fallback while other categories remain dynamic.
    const staticGpuCategory = FALLBACK_PRICING_DATA.find(
      (category) => category.id === "gpu-instance"
    );

    if (staticGpuCategory) {
      const firstGpuIndex = pricingData.findIndex(
        (category) => category.id === "gpu" || category.id === "gpu-instance"
      );

      const withoutGpuCategories = pricingData.filter(
        (category) => category.id !== "gpu" && category.id !== "gpu-instance"
      );

      const insertIndex =
        firstGpuIndex >= 0
          ? Math.min(firstGpuIndex, withoutGpuCategories.length)
          : Math.min(1, withoutGpuCategories.length);

      withoutGpuCategories.splice(insertIndex, 0, staticGpuCategory);
      pricingData = withoutGpuCategories;
    }
  }

  return <PricingClient categories={pricingData} />;
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingLoadingSkeleton />}>
      <PricingContent />
    </Suspense>
  );
}

// Enable ISR with 5 minute revalidation
export const revalidate = 300;
