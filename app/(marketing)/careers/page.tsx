import type { Metadata } from "next";
import { ArrowRight, Code2, Network, LineChart, Megaphone, MapPin, Clock } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Join AhuraSense Technologies. We're hiring across engineering and business — cloud architects, network architects, sales, and marketing — to build enterprise-grade cloud and AI infrastructure from Ahmedabad, India.",
  alternates: {
    canonical: `${siteConfig.url}/careers`,
  },
  openGraph: {
    title: `Careers | ${siteConfig.name}`,
    description:
      "Build the infrastructure behind modern AI and cloud workloads. Open roles in engineering and business.",
    url: `${siteConfig.url}/careers`,
  },
};

const CAREERS_EMAIL = "careers@ahurasense.com";

type Role = {
  title: string;
  icon: typeof Code2;
  location: string;
  type: string;
  summary: string;
  responsibilities: string[];
};

type Department = {
  label: string;
  blurb: string;
  roles: Role[];
};

const DEPARTMENTS: Department[] = [
  {
    label: "Technical",
    blurb: "Design and operate the platform that powers compute, GPU, and AI workloads at scale.",
    roles: [
      {
        title: "Cloud Architect",
        icon: Code2,
        location: "Ahmedabad, India · Hybrid",
        type: "Full-time",
        summary:
          "Own the architecture of our multi-tenant cloud — compute, storage, Kubernetes, and the AI serving stack — with a focus on reliability, security, and cost-efficiency at scale.",
        responsibilities: [
          "Design highly available, multi-region service architectures",
          "Define standards for observability, capacity planning, and disaster recovery",
          "Partner with product to ship new services from prototype to production",
        ],
      },
      {
        title: "Network Architect",
        icon: Network,
        location: "Ahmedabad, India · Hybrid",
        type: "Full-time",
        summary:
          "Lead the design of our network fabric — routing, edge delivery, DDoS protection, and private interconnects — to deliver low-latency, secure connectivity across regions.",
        responsibilities: [
          "Architect L3/L4 network topology, peering, and traffic engineering",
          "Build defense-in-depth: segmentation, firewalling, and DDoS mitigation",
          "Optimize edge and CDN delivery for sub-20ms latency targets",
        ],
      },
    ],
  },
  {
    label: "Non-Technical",
    blurb: "Take our platform to market and grow the teams that build with us.",
    roles: [
      {
        title: "Sales",
        icon: LineChart,
        location: "Ahmedabad, India · Hybrid",
        type: "Full-time",
        summary:
          "Drive revenue across our cloud and AI portfolio — from on-demand GPUs to reserved clusters and enterprise deployments — by understanding customer workloads and closing technical deals.",
        responsibilities: [
          "Own the full sales cycle from qualification to close",
          "Translate customer requirements into right-sized infrastructure proposals",
          "Build lasting relationships with founders, platform, and procurement teams",
        ],
      },
      {
        title: "Marketing",
        icon: Megaphone,
        location: "Ahmedabad, India · Hybrid",
        type: "Full-time",
        summary:
          "Shape how the world hears about AhuraSense — own positioning, content, demand generation, and brand across a fast-moving cloud and AI market.",
        responsibilities: [
          "Plan and run demand-generation and product-launch campaigns",
          "Craft technical content, case studies, and developer-facing narratives",
          "Measure and grow the funnel across channels with clear attribution",
        ],
      },
    ],
  },
];

const PERKS = [
  {
    title: "Build at the frontier",
    body: "Work on GPU, AI inference, and large-scale cloud systems that real customers depend on every day.",
  },
  {
    title: "Ownership from day one",
    body: "Small, senior team — your work ships and you see its impact end to end.",
  },
  {
    title: "Growth & learning",
    body: "Direct exposure to the full infrastructure stack, with budget for certifications and conferences.",
  },
];

function applyHref(role: string) {
  const subject = encodeURIComponent(`Application — ${role}`);
  const body = encodeURIComponent(
    `Hi AhuraSense team,\n\nI'd like to apply for the ${role} role.\n\nName:\nLocation:\nLinkedIn / portfolio:\nWhy I'm a fit:\n\n(Attach your resume to this email.)`,
  );
  return `mailto:${CAREERS_EMAIL}?subject=${subject}&body=${body}`;
}

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/[0.08] pt-28 pb-14 sm:pt-32 sm:pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(0,149,255,0.18),transparent_45%),radial-gradient(circle_at_88%_15%,rgba(255,255,255,0.08),transparent_40%)]" />
        <Container className="relative">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#0095FF]">Careers</p>
          <h1 className="mt-4 max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight leading-tight">
            Build the infrastructure behind modern{" "}
            <span className="text-[#0095FF]">AI and cloud</span>
          </h1>
          <p className="mt-5 max-w-3xl text-sm sm:text-base leading-7 text-white/65">
            We&apos;re a small, senior team building an enterprise-grade cloud and AI platform from
            Ahmedabad, India. If you want real ownership and hard problems, we&apos;d love to hear
            from you.
          </p>
        </Container>
      </section>

      {/* Why join */}
      <section className="py-12 sm:py-14 lg:py-16">
        <Container>
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Why AhuraSense</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {PERKS.map((perk) => (
              <div
                key={perk.title}
                className="border border-white/[0.08] bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors"
              >
                <h3 className="text-lg">{perk.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{perk.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Open roles */}
      <section className="pb-12 sm:pb-14 lg:pb-16">
        <Container>
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Open Roles</h2>
          <div className="mt-8 space-y-12">
            {DEPARTMENTS.map((dept) => (
              <div key={dept.label}>
                <div className="mb-5 border-b border-white/[0.08] pb-3">
                  <h3 className="text-xl sm:text-2xl">{dept.label}</h3>
                  <p className="mt-1 text-sm text-white/55">{dept.blurb}</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {dept.roles.map((role) => (
                    <article
                      key={role.title}
                      className="flex flex-col border border-white/[0.08] bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-white/[0.08] bg-[#0d0e11] text-[#0095FF]">
                          <role.icon className="h-[18px] w-[18px]" />
                        </span>
                        <div>
                          <h4 className="text-xl leading-tight">{role.title}</h4>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 text-[#0095FF]" />
                              {role.location}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="h-3 w-3 text-[#0095FF]" />
                              {role.type}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-white/65">{role.summary}</p>
                      <ul className="mt-4 space-y-2">
                        {role.responsibilities.map((r) => (
                          <li key={r} className="flex gap-2.5 text-sm leading-6 text-white/60">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#0095FF]" />
                            {r}
                          </li>
                        ))}
                      </ul>
                      <a
                        href={applyHref(role.title)}
                        className="mt-6 inline-flex w-fit items-center gap-1.5 bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90 transition-colors"
                      >
                        Apply now
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Don't see a fit */}
      <section className="pb-16 sm:pb-20">
        <Container>
          <div className="border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8 lg:p-10">
            <h2 className="text-2xl sm:text-3xl font-normal">Don&apos;t see your role?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              We&apos;re always glad to meet talented people. Send us your resume and tell us how
              you&apos;d like to contribute.
            </p>
            <a
              href={applyHref("Open Application")}
              className="mt-6 inline-flex items-center gap-1.5 border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Email {CAREERS_EMAIL}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </Container>
      </section>
    </main>
  );
}
