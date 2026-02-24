"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type PricingTier = {
  name: string;
  badge?: string;
  price: {
    monthly: number;
    yearly: number;
  };
  billingPeriod?: string;
  features: string[];
  highlighted?: boolean;
  ctaText: string;
  ctaLink: string;
};

type ServiceCategory = {
  id: string;
  label: string;
  tiers: PricingTier[];
};

const PRICING_DATA: ServiceCategory[] = [
  {
    id: "compute",
    label: "Compute",
    tiers: [
      {
        name: "Starter Free",
        badge: "Limited Time",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Free credits for new projects",
        features: [
          "2 vCPU, 4GB RAM, 100GB SSD",
          "1TB bandwidth",
          "99.9% uptime SLA",
          "24/7 support",
        ],
        ctaText: "Best for Firms",
        ctaLink: "/signup",
      },
      {
        name: "Balanced",
        price: { monthly: 79, yearly: 949 },
        billingPeriod: "per month billed monthly",
        features: [
          "8 vCPU, 16GB RAM, 500GB SSD",
          "Unlimited bandwidth",
          "99.99% uptime SLA",
          "Priority support",
          "Auto-scaling",
          "Load balancing",
          "Custom domains",
          "SSL certificates",
          "Daily backups",
          "DDoS protection",
        ],
        highlighted: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        name: "Premium",
        price: { monthly: 199, yearly: 2388 },
        billingPeriod: "per month billed monthly",
        features: [
          "16 vCPU, 32GB RAM, 1TB NVMe",
          "Unlimited bandwidth",
          "99.999% uptime SLA",
          "Dedicated support",
          "Advanced monitoring",
          "Multi-region deployment",
        ],
        ctaText: "$ 0",
        ctaLink: "/signup",
      },
      {
        name: "Starter",
        price: { monthly: 39, yearly: 468 },
        billingPeriod: "per month",
        features: [
          "4 vCPU, 8GB RAM, 200GB SSD",
          "5TB bandwidth",
          "99.95% uptime SLA",
        ],
        ctaText: "$ 0",
        ctaLink: "/signup",
      },
      {
        name: "Maker",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Small dev usage",
        features: [
          "1 vCPU, 2GB RAM, 50GB SSD",
          "500GB bandwidth",
        ],
        ctaText: "$ 0",
        ctaLink: "/signup",
      },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    tiers: [
      {
        name: "Basic Storage",
        price: { monthly: 5, yearly: 60 },
        billingPeriod: "per 100GB/month",
        features: [
          "100GB storage",
          "Standard performance",
          "99.9% durability",
          "Daily backups",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        name: "Pro Storage",
        price: { monthly: 49, yearly: 588 },
        billingPeriod: "per 1TB/month",
        features: [
          "1TB storage",
          "High performance",
          "99.99% durability",
          "Hourly backups",
          "CDN integration",
        ],
        highlighted: true,
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        name: "Enterprise Storage",
        price: { monthly: 199, yearly: 2388 },
        billingPeriod: "per 5TB/month",
        features: [
          "5TB+ storage",
          "Ultra performance",
          "99.999% durability",
          "Real-time replication",
          "Custom retention",
        ],
        ctaText: "Contact Sales",
        ctaLink: "/contact",
      },
    ],
  },
  {
    id: "database",
    label: "Database",
    tiers: [
      {
        name: "Developer",
        price: { monthly: 0, yearly: 0 },
        billingPeriod: "Free tier",
        features: [
          "500MB database",
          "Basic queries",
          "Community support",
        ],
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
    id: "object-storage",
    label: "Object Storage",
    tiers: [
      {
        name: "Standard",
        price: { monthly: 0.023, yearly: 0.276 },
        billingPeriod: "per GB/month",
        features: [
          "Standard access",
          "99.9% availability",
          "Regional storage",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
      },
      {
        name: "Infrequent Access",
        price: { monthly: 0.0125, yearly: 0.15 },
        billingPeriod: "per GB/month",
        features: [
          "Low-cost storage",
          "99.5% availability",
          "Retrieval fees apply",
        ],
        ctaText: "Learn More",
        ctaLink: "/contact",
      },
      {
        name: "Archive",
        price: { monthly: 0.004, yearly: 0.048 },
        billingPeriod: "per GB/month",
        features: [
          "Long-term storage",
          "Lowest cost",
          "Extended retrieval time",
        ],
        ctaText: "Get Started",
        ctaLink: "/signup",
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
        features: [
          "1 application",
          "Basic features",
          "Community support",
        ],
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

  const currentCategory = PRICING_DATA.find((cat) => cat.id === activeCategory);

  return (
    <main className="min-h-screen bg-black text-white pt-20">
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
          <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-full p-1">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "px-4 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-200",
                billingCycle === "monthly"
                  ? "bg-white text-black"
                  : "text-white/60 hover:text-white"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "px-4 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-200",
                billingCycle === "yearly"
                  ? "bg-white text-black"
                  : "text-white/60 hover:text-white"
              )}
            >
              <span className="hidden sm:inline">Pay annually get 20%</span>
              <span className="sm:hidden">Yearly</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content - Tabs and Pricing */}
      <section className="mx-auto w-full max-w-[75%] px-[clamp(24px,3vw,80px)] pb-16 md:pb-24">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Left Side - Category Tabs */}
          <aside className="lg:w-64 shrink-0">
            <div className="lg:sticky lg:top-24 space-y-1">
              {PRICING_DATA.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                    activeCategory === category.id
                      ? "bg-white/10 text-white border border-white/20"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </aside>

          {/* Right Side - Pricing Cards */}
          <div className="flex-1">
            <div className="space-y-6">
              {currentCategory?.tiers.map((tier, index) => (
                <div
                  key={index}
                  className={cn(
                    "border rounded-lg p-6 md:p-8 transition-all duration-200",
                    tier.highlighted
                      ? "border-[#0095FF] bg-[#0095FF]/5"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  )}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                    {/* Left Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl md:text-2xl font-semibold">
                          {tier.name}
                        </h3>
                        {tier.badge && (
                          <span className="px-2.5 py-1 bg-[#0095FF] text-white text-[10px] font-medium rounded">
                            {tier.badge}
                          </span>
                        )}
                      </div>

                      <div className="mb-6">
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="text-3xl md:text-4xl font-semibold">
                            ${billingCycle === "monthly" ? tier.price.monthly : (tier.price.yearly / 12).toFixed(2)}
                          </span>
                          {tier.price.monthly > 0 && (
                            <span className="text-white/40 text-sm">
                              /{billingCycle === "monthly" ? "mo" : "mo"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40">
                          {tier.billingPeriod}
                        </p>
                      </div>

                      {/* Features Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {tier.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-[#0095FF] mt-0.5 shrink-0" />
                            <span className="text-xs md:text-sm text-white/70">
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right Content - CTA */}
                    <div className="md:w-48 shrink-0">
                      <a
                        href={tier.ctaLink}
                        className={cn(
                          "block w-full text-center px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                          tier.highlighted
                            ? "bg-[#0095FF] text-white hover:bg-[#007ad6]"
                            : "border border-white/20 text-white hover:bg-white/5"
                        )}
                      >
                        {tier.ctaText}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
