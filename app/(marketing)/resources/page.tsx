import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  FileText,
  Megaphone,
  Scale,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Everything you need to know about building a business, from raising funding to marketing your product.",
  alternates: {
    canonical: `${siteConfig.url}/resources`,
  },
  openGraph: {
    title: "Resources | AhuraSense Cloud",
    description:
      "Business growth guides covering fundraising, go-to-market strategy, pricing, sales, and marketing.",
    url: `${siteConfig.url}/resources`,
  },
};

const BUSINESS_GUIDES = [
  {
    title: "Raising Your First Round",
    category: "Fundraising",
    description:
      "How to structure your story, build a credible data room, and run a disciplined fundraising process.",
    icon: Briefcase,
    href: "/blog",
  },
  {
    title: "Product Positioning That Converts",
    category: "Go-To-Market",
    description:
      "Turn technical features into clear value propositions customers understand and buy quickly.",
    icon: Megaphone,
    href: "/blog",
  },
  {
    title: "Pricing Models for SaaS Teams",
    category: "Monetization",
    description:
      "Choose pricing that scales with customer value while protecting margin and reducing churn risk.",
    icon: TrendingUp,
    href: "/blog",
  },
  {
    title: "Hiring Your First 20 People",
    category: "People Ops",
    description:
      "Build a hiring roadmap, define role scorecards, and avoid costly early-stage hiring mistakes.",
    icon: Users,
    href: "/blog",
  },
  {
    title: "Demand Generation for Technical Products",
    category: "Marketing",
    description:
      "A practical channel strategy for content, partnerships, SEO, and community-led customer growth.",
    icon: BookOpen,
    href: "/blog",
  },
  {
    title: "Operational Playbooks for Scale",
    category: "Operations",
    description:
      "Design reliable internal processes for incident response, customer support, and release management.",
    icon: FileText,
    href: "/blog",
  },
];

const LEARNING_TRACKS = [
  {
    stage: "0 -> 1",
    title: "Validate and Fund",
    description:
      "Nail ICP, establish early signal, and raise with confidence using evidence instead of assumptions.",
  },
  {
    stage: "1 -> 10",
    title: "Find Repeatable Growth",
    description:
      "Refine positioning, pricing, and pipeline systems until acquisition and onboarding become predictable.",
  },
  {
    stage: "10 -> 100",
    title: "Scale with Control",
    description:
      "Build teams, workflows, and governance that protect quality while accelerating execution.",
  },
];

const OPERATOR_RESOURCES = [
  { title: "Founder Dashboard Metrics", href: "/blog" },
  { title: "Pitch Deck Structure Guide", href: "/blog" },
  { title: "GTM Planning Template", href: "/blog" },
  { title: "Content Distribution Checklist", href: "/blog" },
  { title: "Customer Retention Playbook", href: "/blog" },
  { title: "Quarterly Planning Cadence", href: "/blog" },
];

const POLICY_DOCS = [
  { title: "Terms of Service", href: "/terms", icon: Scale },
  { title: "Privacy Policy", href: "/privacy", icon: ShieldCheck },
  { title: "Cookies Policy", href: "/cookies", icon: FileText },
  { title: "Data Processing Agreement", href: "/dpa", icon: BookOpen },
];

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden border-b border-white/[0.08] pt-28 pb-14 sm:pt-32 sm:pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(0,149,255,0.15),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(255,255,255,0.08),transparent_40%)]" />
        <Container className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">Resources</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight">
            Everything you need to know about building a business
          </h1>
          <p className="mt-5 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
            From raising funding to marketing your product, this hub gives founders and operators a
            practical library of playbooks for growth, execution, and scale.
          </p>
        </Container>
      </section>

      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          <header className="mb-6">
            <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Business Building Library</h2>
            <p className="mt-2 text-sm sm:text-base text-white/60">
              Actionable guidance for founders, growth teams, and operators.
            </p>
          </header>
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            {BUSINESS_GUIDES.map((guide) => (
              <Link
                key={guide.title}
                href={guide.href}
                className="group border border-white/[0.08] bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
              >
                <guide.icon className="h-5 w-5 text-[#0095FF]" />
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-white/55">
                  {guide.category}
                </p>
                <h3 className="mt-2 text-xl text-white">{guide.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{guide.description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/70 group-hover:text-[#9ad5ff] transition-colors">
                  Read guide
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-2 sm:py-4 lg:py-6">
        <Container>
          <header className="mb-6">
            <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Learning Tracks by Stage</h2>
            <p className="mt-2 text-sm sm:text-base text-white/60">
              Follow the playbook that matches your current growth phase.
            </p>
          </header>
          <div className="grid gap-4 md:grid-cols-3">
            {LEARNING_TRACKS.map((track) => (
              <article
                key={track.stage}
                className="border border-white/[0.08] bg-white/[0.02] p-6"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-[#0095FF]">{track.stage}</p>
                <h3 className="mt-2 text-xl text-white">{track.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{track.description}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-normal">Operator Toolkit</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Templates and references to speed up decision-making across product, growth, and
                operations.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {OPERATOR_RESOURCES.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="inline-flex items-center justify-between border border-white/[0.08] px-4 py-3 text-sm text-white/75 hover:text-white hover:bg-white/[0.04] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
                  >
                    {item.title}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-normal">Trust and Policy</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Core documents for procurement, legal review, and privacy due diligence.
              </p>
              <div className="mt-6 space-y-3">
                {POLICY_DOCS.map((doc) => (
                  <Link
                    key={doc.href}
                    href={doc.href}
                    className="inline-flex w-full items-center justify-between border border-white/[0.08] px-4 py-3 text-sm text-white/75 hover:text-white hover:bg-white/[0.04] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <doc.icon className="h-4 w-4 text-[#0095FF]" />
                      {doc.title}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
              <Link
                href="/blog"
                className="mt-6 inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095FF]"
              >
                Explore all articles
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}

