import type { Metadata } from "next";
import { Cpu, Zap, ShieldCheck, Clock, Mail, MapPin } from "lucide-react";
import { siteConfig } from "@/config/site";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: `Contact Sales — ${siteConfig.name}`,
  description:
    "Talk to the AhuraSense Cloud team about reserved B300 / B200 / H200 GPU clusters, on-demand GPUs, AI inference and fine-tuning, and enterprise & sovereign deployments — hosted in India.",
  alternates: { canonical: `${siteConfig.url}/contact` },
  openGraph: {
    title: `Contact Sales — ${siteConfig.name}`,
    description:
      "Reserved GPU clusters, on-demand GPUs, and managed AI infrastructure — hosted in India. Tell us what you're building.",
    url: `${siteConfig.url}/contact`,
  },
};

const SALES_EMAIL = "sales@ahurasense.com";
const SUPPORT_EMAIL = "support@ahurasense.com";
const OFFICE_ADDRESS =
  "6th Floor, Shivalik Shilp Corporate Office, Sanidhya, Ahmedabad, Gujarat 380058";

const HIGHLIGHTS: Array<{ icon: typeof Cpu; title: string; body: string }> = [
  {
    icon: Cpu,
    title: "Reserved GPU clusters",
    body: "Committed B300 / B200 / H200 capacity with discounted, predictable pricing.",
  },
  {
    icon: Zap,
    title: "On-demand & managed AI",
    body: "Per-second GPUs, serverless inference, fine-tuning, and dedicated model serving.",
  },
  {
    icon: ShieldCheck,
    title: "India-hosted & compliant",
    body: "Data resident in India for DPDP-Act and sector data-residency requirements.",
  },
  {
    icon: Clock,
    title: "Fast response",
    body: "We reply within one business day — sooner for time-sensitive procurement.",
  },
];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;

  return (
    <main className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-[#08090b] text-white">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[280px] left-1/2 h-[760px] w-[1100px] -translate-x-1/2 blur-[80px]"
          style={{ background: "radial-gradient(closest-side, rgba(0,149,255,0.10), transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pt-32">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">
            Contact sales
          </span>
          <h1 className="mt-5 text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[46px]">
            Let&apos;s build your{" "}
            <span className="text-[#0095FF]">AI infrastructure</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/55">
            Tell us about your workload, reserved GPU clusters, on-demand
            capacity, or a fully-managed AI deployment. Our team will help you
            size it, price it, and get you running on India-hosted infrastructure.
          </p>
        </div>

        {/* Body */}
        <div className="mt-12 grid grid-cols-1 gap-8 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
          {/* Left — value props + direct contact */}
          <div className="lg:pt-2">
            <div className="space-y-6">
              {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <span
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-[#0d0e11]"
                    style={{ color: "#0095FF" }}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">{title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-white/50">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[12px] border border-white/[0.08] bg-[#0d0e11] p-5">
              <p className="text-[12px] uppercase tracking-[0.14em] text-white/40">Prefer email?</p>
              <div className="mt-3 space-y-2.5">
                <a
                  href={`mailto:${SALES_EMAIL}`}
                  className="flex items-center gap-2 text-[15px] font-medium text-white transition-colors hover:text-[#0095FF]"
                >
                  <Mail className="h-4 w-4 text-[#0095FF]" />
                  {SALES_EMAIL}
                  <span className="text-[12px] font-normal text-white/40">— sales</span>
                </a>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="flex items-center gap-2 text-[15px] font-medium text-white transition-colors hover:text-[#0095FF]"
                >
                  <Mail className="h-4 w-4 text-[#0095FF]" />
                  {SUPPORT_EMAIL}
                  <span className="text-[12px] font-normal text-white/40">— support</span>
                </a>
              </div>
            </div>

            <div className="mt-4 rounded-[12px] border border-white/[0.08] bg-[#0d0e11] p-5">
              <p className="text-[12px] uppercase tracking-[0.14em] text-white/40">
                Ahurasense Technologies
              </p>
              <address className="mt-2 flex items-start gap-2 not-italic text-[13.5px] leading-relaxed text-white/60">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0095FF]" />
                <span>{OFFICE_ADDRESS}</span>
              </address>
            </div>
          </div>

          {/* Right — form */}
          <ContactForm initialTopic={topic} />
        </div>
      </div>
    </main>
  );
}
