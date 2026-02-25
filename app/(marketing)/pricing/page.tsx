"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PricingContent, type ServiceCategory } from "@/components/pricing/pricing-content";

const PRICING_DATA: ServiceCategory[] = [
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
      "General purpose instances for web apps, gaming servers, APIs, workers, and backend services.",
    promos: [
      {
        badge: "Crypto Deal",
        badgeNote: "Limited-time",
        title: "Get GPU and Application Deployment  ",
        description:
          "Pay with supported cryptocurrencies and unlock a limited-time promo price on the Balanced tier.",
        subtext:
          "Applies to new purchases only. One promo per account. Taxes/fees may appl",
        linkText: "See terms",
        linkHref: "/pricing",
      },
      {
        badge: "Startup Offer",
        badgeNote: "Limited-time",
        title: "Free credits for AI with purchase of any GPU Instance",
        description:
          "Launch your first VM and get starter credits for 30 days.",
        linkText: "Learn More",
        linkHref: "/contact",
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
          " Root access + full OS control",
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
      {
        id: "enterprise-ultra",
        name: "Enterprise/Ultra",
        shortDescription: "High-performance compute for demanding workloads",
        price: { monthly: 199, yearly: 2388 },
        billingPeriod: "per month billed yearly",
        features: [
          "CUDA-ready environment",
          "Monitoring & alerts",
          "Snapshots",
          "Private networking",
          "API access",
          "Secure images",
          "SSH keys",
          "Usage dashboards",
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
    id: "object-storage",
    label: "Object Storage",
    description:
      "S3-compatible object storage for backups, media, logs, datasets, and static website hosting.",
    promos: [
      {
        badge: " Deal",
        badgeNote: "Limited-time",
        title: "Reduced egress on annual ",
        description:
          "Cut data transfer costs for media-heavy apps and CDN workflows",
        subtext:
          "Fair-use applies",
        linkText: "See Balanced",
        linkHref: "/pricing",
      },
    ],
    tiers: [
      {
        id: "balanced",
        name: "Balanced",
        shortDescription:
          " Most popular for products",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["S3 API" ,   "Encryption"  ,  "Lifecycle"],
        features: [
          "Great value",
          "Simple integration",
          "Fast",
          "Reliable",
          "S3 API",
          "Encryption",
          "Lifecycle",
          "Signed URLs"
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
     {
        id: "enterprise",
        name: "Enterprise",
        shortDescription:
          " Most popular for products",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["S3 API" ,   "Encryption"  ,  "Lifecycle"],
        features: [
          "Great value",
          "Simple integration",
          "Fast",
          "Reliable",
          "S3 API",
          "Encryption",
          "Lifecycle",
          "Signed URLs"
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
     {
        id: "enterprise-ultra",
        name: "Enterprise Ultra",
        shortDescription:
          " Most popular for products",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["S3 API" ,   "Encryption"  ,  "Lifecycle"],
        features: [
          "Great value",
          "Simple integration",
          "Fast",
          "Reliable",
          "S3 API",
          "Encryption",
          "Lifecycle",
          "Signed URLs"
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
      {
        id: "standard",
        name: "Standard",
        shortDescription:
          " Most popular for products",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["S3 API" ,   "Encryption"  ,  "Lifecycle"],
        features: [
          "Great value",
          "Simple integration",
          "Fast",
          "Reliable",
          "S3 API",
          "Encryption",
          "Lifecycle",
          "Signed URLs"
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
      {
        id: "starter",
        name: "Starter",
        shortDescription:
          " Most popular for products",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        specs: ["S3 API" ,   "Encryption"  ,  "Lifecycle"],
        features: [
          "Great value",
          "Simple integration",
          "Fast",
          "Reliable",
          "S3 API",
          "Encryption",
          "Lifecycle",
          "Signed URLs"
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
    ]
  },
  {
    id: "database",
    label: "Database",
    tiers: [
      {
        name: "Developer",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Free tier",
        features: ["500MB database", "Basic queries", "Community support"],
        ctaText: "Start Free",
        ctaLink: "/signup",
      },
      {
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
    id: "security",
    label: "Security",
    tiers: [
      {
        name: "Basic Shield",
        price: { monthly: 29, yearly: 348 },
        billingPeriod: "per month",
        features: [
          "DDoS protection",
          "SSL certificates",
          "Firewall rules",
          "Security monitoring",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        name: "Advanced Shield",
        price: { monthly: 99, yearly: 1188 },
        billingPeriod: "per month",
        features: [
          "Advanced DDoS protection",
          "WAF",
          "Vulnerability scanning",
          "Security audits",
          "Compliance reports",
        ],
        highlighted: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        name: "Enterprise Shield",
        price: { monthly: 299, yearly: 3588 },
        billingPeriod: "per month",
        features: [
          "Enterprise DDoS protection",
          "Advanced WAF",
          "Penetration testing",
          "SOC 2 compliance",
          "Dedicated security team",
        ],
        ctaText: "Contact Sales",
        ctaLink: "/contact",
      },
    ],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    tiers: [
      {
        name: "Starter Cluster",
        price: { monthly: 49, yearly: 588 },
        billingPeriod: "per cluster/month",
        features: [
          "3 nodes",
          "Basic monitoring",
          "Auto-scaling",
          "Load balancing",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
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
    id: "ai-deployment",
    label: "AI Agents Deployment",
    tiers: [
      {
        name: "Starter AI",
        price: { monthly: 99, yearly: 1188 },
        billingPeriod: "per month",
        features: [
          "GPU compute hours",
          "Model hosting",
          "API access",
          "Basic monitoring",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
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
    tiers: [
      {
        name: "Hobby",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Free tier",
        features: ["1 application", "Basic features", "Community support"],
        ctaText: "Start Free",
        ctaLink: "/signup",
      },
      {
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

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activeCategory, setActiveCategory] = useState<string>("compute");
  const [expandedTierId, setExpandedTierId] = useState<string>("performance");

  const currentCategory = PRICING_DATA.find((cat) => cat.id === activeCategory);

  return (
    <main className="min-h-screen bg-[#191919] text-white pt-20">
      {/* Header Section */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] py-12 md:py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold mb-4">
            Pricing
          </h1>
          <p className="text-white/60 text-sm md:text-base mb-3">
            Pricing that scales from starter to enterprise
          </p>
          <p className="text-white/40 text-xs md:text-sm mb-8">
            Pick a category from the left and compare tiers. Designed to match a
            thoughtful→lean <br className="hidden sm:block" />
            deploy, scale navigation, easy cost, HTML, and simple top-offs.
          </p>

          {/* Toggle Switch */}
          <div className=" inline-flex items-center gap-4 text-xs md:text-sm font-medium">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "cursor-pointer transition-colors duration-200",
                billingCycle === "monthly" ? "text-white" : "text-white/50 hover:text-white"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() =>
                setBillingCycle((prev) => (prev === "monthly" ? "yearly" : "monthly"))
              }
              aria-pressed={billingCycle === "yearly"}
              className="relative h-6 w-12 rounded-full border border-white/20 bg-white/10 transition-colors duration-200"
            >
              <span
                className={cn(
                  "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all duration-200",
                  billingCycle === "yearly" ? "right-1" : "left-1"
                )}
              />
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "cursor-pointer transition-colors duration-200",
                billingCycle === "yearly" ? "text-white" : "text-white/50 hover:text-white"
              )}
            >
              Pay annually get 20%
            </button>
          </div>
        </div>
      </section>

      {/* Main Content - Tabs and Pricing */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] pb-16 md:pb-24">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
          {/* Left Side - Category Tabs */}
          <aside className="lg:w-60 shrink-0 border-r border-white pr-4">
            <div className="lg:sticky lg:top-24">
              <div className="space-y-1 font-[family-name:var(--font-sansation)]">
                {PRICING_DATA.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm font-medium transition-all duration-200",
                      activeCategory === category.id
                        ? "bg-white text-black"
                        : "text-white/50 hover:text-white"
                    )}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <PricingContent
            category={currentCategory}
            billingCycle={billingCycle}
            expandedTierId={expandedTierId}
            setExpandedTierId={setExpandedTierId}
          />
        </div>
      </section>
    </main>
  );
}
