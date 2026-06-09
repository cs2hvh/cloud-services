import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Quote } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Customers",
  description:
    "See how teams build on AhuraSense Cloud — running AI inference, GPU training, Kubernetes, databases, and global compute with enterprise-grade reliability.",
  alternates: {
    canonical: `${siteConfig.url}/customers`,
  },
  openGraph: {
    title: `Customers | ${siteConfig.name}`,
    description:
      "Stories from teams running production AI and cloud workloads on AhuraSense.",
    url: `${siteConfig.url}/customers`,
  },
};

const STATS = [
  { value: "99.99%", label: "Uptime SLA" },
  { value: "12", label: "Global regions" },
  { value: "<20ms", label: "Edge latency" },
  { value: "24/7", label: "Expert support" },
];

const STORIES = [
  {
    company: "An AI Product Studio",
    industry: "Artificial Intelligence",
    quote:
      "We moved our inference and fine-tuning onto dedicated GPUs and cut response latency dramatically while keeping costs predictable. One API for everything made the migration painless.",
    person: "VP, Engineering",
    result: "3× faster model serving",
    href: "/services/inference",
  },
  {
    company: "A High-Growth SaaS",
    industry: "Software",
    quote:
      "Git-push deployments, managed Postgres, and autoscaling Kubernetes let our small team ship like a much bigger one. Reliability has been rock solid through every traffic spike.",
    person: "Co-founder & CTO",
    result: "Zero-downtime releases",
    href: "/services/app-deployment",
  },
  {
    company: "A Fintech Platform",
    industry: "Financial Services",
    quote:
      "Data residency in India and strong network isolation were non-negotiable for us. The platform met our compliance bar without slowing down our roadmap.",
    person: "Head of Platform",
    result: "Met data-residency requirements",
    href: "/services/security",
  },
  {
    company: "A Media & Streaming Company",
    industry: "Media",
    quote:
      "Object storage with global delivery and DDoS protection meant we could serve millions of users without a dedicated infra team. Cost per GB stayed flat as we scaled.",
    person: "Director, Infrastructure",
    result: "Petabyte-scale delivery",
    href: "/services/object-storage",
  },
];

const USE_CASES = [
  { title: "AI & Inference", body: "Serverless inference, fine-tuning, and dedicated model hosting." },
  { title: "Compute & GPU", body: "On-demand VMs and NVIDIA GPUs for training and high-throughput workloads." },
  { title: "Data & Storage", body: "Managed databases and S3-compatible object storage with backups." },
  { title: "Platform & Network", body: "Kubernetes, app deployment, DNS, and DDoS-protected delivery." },
];

export default function CustomersPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/[0.08] pt-28 pb-14 sm:pt-32 sm:pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(0,149,255,0.18),transparent_45%),radial-gradient(circle_at_88%_15%,rgba(255,255,255,0.08),transparent_40%)]" />
        <Container className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">Customers</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight">
            Teams build what matters on{" "}
            <span className="text-[#0095FF]">AhuraSense</span>
          </h1>
          <p className="mt-5 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
            From AI startups to established platforms, teams run their most demanding workloads on
            our cloud — and trust us to keep them fast, secure, and always on.
          </p>
        </Container>
      </section>

      {/* Stats */}
      <section className="border-b border-white/[0.08] py-10 sm:py-12">
        <Container>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-black p-6 text-center sm:p-8">
                <div className="text-3xl sm:text-4xl font-normal text-white">{s.value}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/45">{s.label}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Stories */}
      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Customer stories</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            A look at how teams across industries put the platform to work.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {STORIES.map((story) => (
              <article
                key={story.company}
                className="flex flex-col border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8 hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#0095FF]">
                    {story.industry}
                  </p>
                  <Quote className="h-5 w-5 text-white/15" />
                </div>
                <p className="mt-4 text-base leading-7 text-white/80">&ldquo;{story.quote}&rdquo;</p>
                <div className="mt-5 text-sm text-white/55">
                  <span className="text-white/80">{story.person}</span> · {story.company}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <span className="inline-flex items-center border border-[#0095FF]/30 bg-[#0095FF]/[0.08] px-3 py-1 text-xs text-[#9ad5ff]">
                    {story.result}
                  </span>
                  <Link
                    href={story.href}
                    className="inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-[#9ad5ff] transition-colors"
                  >
                    Explore the service
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Use cases */}
      <section className="pb-12 sm:pb-14 lg:pb-16">
        <Container>
          <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-normal">What customers run with us</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {USE_CASES.map((u) => (
                <div key={u.title} className="border border-white/[0.08] bg-black p-5">
                  <h3 className="text-base text-[#2d8cff]">{u.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{u.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="pb-16 sm:pb-20">
        <Container>
          <div className="flex flex-col items-start justify-between gap-6 border border-white/[0.08] bg-white/[0.02] p-6 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-normal">Ready to join them?</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
                Start in minutes, or talk to our team about reserved capacity and enterprise
                deployments.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90 transition-colors"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
