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
      "General purpose instances for web apps, gaming servers, APIs, workers, and backend services.",
    promos: [
      {
        badge: "Crypto Deal",
        badgeNote: "Limited-time",
        title: "Balanced for $399 with crypto",
        description:
          "Pay with supported cryptocurrencies and unlock a limited-time promo price on the Balanced tier.",
        subtext: "New purchases only. One promo per account.",
        linkText: "See terms",
        linkHref: "/pricing",
      },
      {
        badge: "Startup Offer",
        badgeNote: "Limited-time",
        title: "Free credits for new projects",
        description:
          "Launch your first VM and get starter credits for 30 days.",
        linkText: "Learn More",
        linkHref: "/contact",
      },
    ],
    tiers: [
      {
        id: "balanced",
        name: "Balanced",
        shortDescription:
          "Ideal for typical production workloads: backed services, web apps, and CI runners.",
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
    id: "gpu",
    label: "GPU",
    description:
      "High-performance GPU instances for AI/ML, rendering, and compute-intensive workloads.",
    promos: [
      {
        badge: "Crypto Deal",
        badgeNote: "Limited-time",
        title: "Get GPU and Application Deployment",
        description:
          "Pay with supported cryptocurrencies and unlock a limited-time promo price on the Balanced tier.",
        subtext:
          "Applies to new purchases only. One promo per account. Taxes/fees may apply",
        linkText: "See terms",
        linkHref: "/pricing",
      },
    ],
    tiers: [
      {
        id: "enterprise",
        name: "Enterprise",
        shortDescription:
          "A strong sweet spot for busy web platforms, ecommerce, and realtime services with sustained load.",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["8 vCPU", "32GB DDR5", "400GB NVMe", "5 Gbit/s"],
        features: [
          "Root access + full OS control",
          "Snapshots & automated backups",
          "IPv4 + IPv6",
          "Firewall rules (ingress/egress)",
          "Monitoring & alerting",
          "API + CLI provisioning",
          "DDoS baseline protection",
          "99.99% uptime target",
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
        id: "developer",
        name: "Developer",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Free tier",
        features: ["500MB database", "Basic queries", "Community support"],
        ctaText: "Start Free",
        ctaLink: "/signup",
      },
      {
        id: "professional",
        name: "Professional",
        price: { monthly: 99, yearly: 1188 },
        billingPeriod: "per month",
        features: [
          "50GB database",
          "Advanced queries",
          "Automated backups",
          "Read replicas",
          "Point-in-time recovery",
        ],
        highlighted: true,
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: { monthly: 399, yearly: 4788 },
        billingPeriod: "per month",
        features: [
          "500GB+ database",
          "Multi-region",
          "Advanced security",
          "Dedicated support",
          "Custom SLA",
        ],
        ctaText: "Contact Sales",
        ctaLink: "/contact",
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
        price: { monthly: 49, yearly: 588 },
        billingPeriod: "per cluster/month",
        features: ["3 nodes", "Basic monitoring", "Auto-scaling", "Load balancing"],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "production-cluster",
        name: "Production Cluster",
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
        id: "enterprise-cluster",
        name: "Enterprise Cluster",
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
    id: "ai-deployment",
    label: "AI Agents Deployment",
    description: "Deploy and scale AI agents and models.",
    tiers: [
      {
        id: "starter-ai",
        name: "Starter AI",
        price: { monthly: 99, yearly: 1188 },
        billingPeriod: "per month",
        features: ["GPU compute hours", "Model hosting", "API access", "Basic monitoring"],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        id: "professional-ai",
        name: "Professional AI",
        price: { monthly: 299, yearly: 3588 },
        billingPeriod: "per month",
        features: [
          "Advanced GPU access",
          "Model training",
          "Auto-scaling",
          "Advanced monitoring",
          "Custom models",
        ],
        highlighted: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        id: "enterprise-ai",
        name: "Enterprise AI",
        price: { monthly: 999, yearly: 11988 },
        billingPeriod: "per month",
        features: [
          "Unlimited GPU access",
          "Multi-model deployment",
          "Dedicated infrastructure",
          "Advanced security",
          "24/7 support",
        ],
        ctaText: "Contact Sales",
        ctaLink: "/contact",
      },
    ],
  },
  {
    id: "app-deployment",
    label: "Application Deployment",
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
    <main className="min-h-screen bg-[#191919] text-white pt-20">
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] py-12 md:py-16">
        <div className="text-center">
          <div className="h-12 bg-neutral-800 rounded w-48 mx-auto mb-4 animate-pulse" />
          <div className="h-4 bg-neutral-800 rounded w-96 mx-auto mb-3 animate-pulse" />
          <div className="h-4 bg-neutral-800 rounded w-80 mx-auto mb-8 animate-pulse" />
        </div>
      </section>
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] pb-16 md:pb-24">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
          <aside className="lg:w-60 shrink-0">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 bg-neutral-800 rounded mb-2 animate-pulse" />
            ))}
          </aside>
          <div className="flex-1">
            <div className="h-64 bg-neutral-800 rounded animate-pulse" />
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
