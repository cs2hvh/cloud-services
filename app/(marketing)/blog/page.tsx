import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/container";
export const metadata: Metadata = {
  title: "Blog",
  description:
    "Engineering stories, architecture guides, product updates, and operational playbooks from the AhuraSense Cloud team.",
  alternates: {
    canonical: `${siteConfig.url}/blog`,
  },
  openGraph: {
    title: "Blog | AhuraSense Cloud",
    description:
      "Insights on cloud engineering, security, scalability, and platform operations.",
    url: `${siteConfig.url}/blog`,
  },
};

const FEATURED_POST = {
  title: "Designing Multi-Region Failover for Customer Workloads",
  category: "Architecture",
  publishedOn: "April 10, 2026",
  readTime: "8 min read",
  excerpt:
    "A practical blueprint for implementing active-passive failover across regions using health checks, graceful degradation, and deterministic traffic cutover.",
  href: "/services/kubernetes",
};

const LATEST_POSTS = [
  {
    title: "A Production Readiness Checklist for Managed Kubernetes",
    category: "Kubernetes",
    publishedOn: "April 7, 2026",
    readTime: "6 min read",
    excerpt:
      "Twelve controls every team should verify before promoting workloads to production clusters.",
    href: "/services/kubernetes",
  },
  {
    title: "How We Tune Database Performance for Predictable Latency",
    category: "Databases",
    publishedOn: "April 3, 2026",
    readTime: "7 min read",
    excerpt:
      "A look at query planning, storage profiles, and background operations that impact p95 latency.",
    href: "/services/database",
  },
  {
    title: "Security Baselines for Public-Facing Compute Services",
    category: "Security",
    publishedOn: "March 29, 2026",
    readTime: "5 min read",
    excerpt:
      "Recommended defaults for access policy, network boundaries, runtime hardening, and observability.",
    href: "/services/security",
  },
  {
    title: "Cost-Efficient Object Storage Patterns for Growth-Stage Teams",
    category: "Storage",
    publishedOn: "March 22, 2026",
    readTime: "5 min read",
    excerpt:
      "Storage tiering and lifecycle strategies that lower cost without impacting retrieval needs.",
    href: "/services/object-storage",
  },
  {
    title: "Building Reliable Deployment Pipelines with Progressive Rollouts",
    category: "DevOps",
    publishedOn: "March 16, 2026",
    readTime: "9 min read",
    excerpt:
      "How staged rollouts, health signals, and rollback gates reduce deployment risk in production.",
    href: "/services/app-deployment",
  },
  {
    title: "What to Include in Your Cloud Security Questionnaire Responses",
    category: "Compliance",
    publishedOn: "March 10, 2026",
    readTime: "6 min read",
    excerpt:
      "A practical framework to answer procurement and security due diligence quickly and accurately.",
    href: "/resources",
  },
];

const TOPICS = [
  "Architecture",
  "Kubernetes",
  "Databases",
  "Security",
  "Storage",
  "DevOps",
  "Compliance",
  "Product Updates",
];

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden border-b border-white/[0.08] pt-28 pb-14 sm:pt-32 sm:pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(0,149,255,0.18),transparent_45%),radial-gradient(circle_at_88%_15%,rgba(255,255,255,0.08),transparent_40%)]" />
        <Container className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">Editorial</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight">
            Cloud engineering insights from the AhuraSense team
          </h1>
          <p className="mt-5 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
            We publish practical playbooks, architecture notes, and product updates for teams
            building and operating modern infrastructure.
          </p>
        </Container>
      </section>

      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          <header className="mb-6">
            <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Featured Story</h2>
          </header>
          <article className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8 lg:p-10">
            <p className="text-xs uppercase tracking-[0.16em] text-[#0095FF]">
              {FEATURED_POST.category}
            </p>
            <h3 className="mt-3 text-3xl sm:text-4xl leading-tight">{FEATURED_POST.title}</h3>
            <p className="mt-4 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
              {FEATURED_POST.excerpt}
            </p>
            <div className="mt-5 flex flex-wrap gap-4 text-xs sm:text-sm text-white/55">
              <span>{FEATURED_POST.publishedOn}</span>
              <span>{FEATURED_POST.readTime}</span>
            </div>
            <Link
              href={FEATURED_POST.href}
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-[#9ad5ff] transition-colors focus-visible:outline-offset-2 focus-visible:outline-[#0095FF] cursor-pointer"
            >
              Explore topic
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        </Container>
      </section>

      <section className="py-2 sm:py-4 lg:py-6">
        <Container>
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Latest Articles</h2>
            <Link
              href="/resources"
              className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-[#9ad5ff] transition-colors cursor-pointer"
            >
              View all resources
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {LATEST_POSTS.map((post) => (
              <article
                key={post.title}
                className="border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6 hover:bg-white/[0.04] transition-colors"
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#0095FF]">
                  {post.category}
                </p>
                <h3 className="mt-3 text-xl leading-snug">{post.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/62">{post.excerpt}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
                  <span>{post.publishedOn}</span>
                  <span>{post.readTime}</span>
                </div>
                <Link
                  href={post.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-[#9ad5ff] transition-colors cursor-pointer"
                >
                  Explore topic
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-normal">Browse by Topic</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Explore articles by subject area to find guidance relevant to your team.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                {TOPICS.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-xs text-white/75"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-normal">Get Product Updates</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Track release milestones, reliability improvements, and platform announcements in one
                place.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 bg-white text-black px-4 py-2.5 text-sm hover:bg-white/90 transition-colors"
                >
                  Subscribe
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/resources"
                  className="inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                  Explore resources
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}

