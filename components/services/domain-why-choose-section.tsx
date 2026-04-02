import Link from "next/link";
import {
  Search,
  Monitor,
  Settings2,
  Headphones,
  Zap,
  ArrowRight,
  LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/container";

type FeatureNode = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  desktopPosition: string;
};

const featureNodes: FeatureNode[] = [
  {
    title: "Smart Search Engine",
    subtitle: "Find domains faster",
    icon: Search,
    desktopPosition: "top-[70px] left-1/2 -translate-x-1/2",
  },
  {
    title: "Real-Time Monitoring",
    subtitle: "Reliable domain performance",
    icon: Monitor,
    desktopPosition: "top-[170px] right-[120px]",
  },
  {
    title: "Flexible Management",
    subtitle: "Full control from one dashboard",
    icon: Settings2,
    desktopPosition: "bottom-[190px] right-[90px]",
  },
  {
    title: "Always-On Support",
    subtitle: "Help when you need it",
    icon: Headphones,
    desktopPosition: "top-[200px] left-[110px]",
  },
  {
    title: "Instant Setup",
    subtitle: "Register and go live in seconds",
    icon: Zap,
    desktopPosition: "bottom-[160px] left-[70px]",
  },
];

export default function DomainWhyChooseSection() {
  return (
    <section className="relative overflow-hidden bg-[#080A0F] py-16 sm:py-20 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "url('/images/main-page/domain-sec-5-bg.svg')",
        }}
        aria-hidden="true"
      />

      <Container className="relative z-10">
        <div className="lg:hidden">
          <div className="mx-auto max-w-[540px] rounded-2xl border border-white/10 bg-black/55 p-5">
            <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80">
              Explore Domain&apos;s Beyond Limits
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight text-white">
              Why Choose <span className="text-[#10A3FF]">AhuraCloud</span> for
              Domains
            </h2>
            <div className="mt-5 space-y-3">
              {featureNodes.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
                  >
                    <span className="mt-0.5 rounded-md bg-white/10 p-1.5">
                      <Icon className="h-4 w-4 text-white/85" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.title}
                      </p>
                      <p className="text-xs text-white/65">{item.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <Link
              href="/signup"
              className="mt-5 inline-flex items-center rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black hover:bg-white"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="relative mx-auto hidden h-[620px] max-w-[1080px] lg:block">
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_#111_20%,_#050505_65%,_transparent_80%)] ring-1 ring-white/15 shadow-[0_0_120px_rgba(255,255,255,0.1)]" />
          <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/55" />

          {featureNodes.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`absolute ${item.desktopPosition}`}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-sm">
                  <Icon className="h-4 w-4 text-white/80" />
                  <div>
                    <p className="text-[11px] font-medium text-white">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-white/65">{item.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <span className="absolute left-[170px] top-[260px] h-4 w-4 rounded-full bg-white/80 shadow-[0_0_14px_rgba(255,255,255,0.7)]" />
          <span className="absolute left-[740px] top-[130px] h-4 w-4 rounded-full bg-white/80 shadow-[0_0_14px_rgba(255,255,255,0.7)]" />
          <span className="absolute left-[700px] bottom-[115px] h-4 w-4 rounded-full bg-white/30 shadow-[0_0_10px_rgba(255,255,255,0.4)]" />
          <span className="absolute left-[95px] bottom-[160px] h-4 w-4 rounded-full bg-white/60 shadow-[0_0_12px_rgba(255,255,255,0.6)]" />

          <div className="absolute left-1/2 top-1/2 z-10 flex w-[280px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
            <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium text-white/80">
              Explore Domain&apos;s Beyond Limits
            </p>
            <h2 className="mt-3 text-[44px] font-semibold leading-[0.94] tracking-tight text-white">
              Why Choose <span className="text-[#10A3FF]">AhuraCloud</span> for
              Domains
            </h2>
            <Link
              href="/signup"
              className="mt-5 inline-flex items-center rounded-full bg-white/90 px-5 py-2 text-sm font-medium text-black hover:bg-white"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
