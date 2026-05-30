"use client";

// Network · DDoS protection overview — editorial canvas (aurora +
// dotted grid), Nunito-accent title, horizontal stats strip,
// floating PNG feature illustrations, and a clean Spectrum app
// inventory. Matches Apps/Database/Object-storage overviews.

import { useMemo } from "react";
import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Tables } from "@/lib/supabase/types";
import SpectrumAppsTable from "./spectrum-apps-table";

type SpectrumApp = Tables<"spectrum_apps">;

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

interface NetworkDDoSMainProps {
  spectrumApps: SpectrumApp[];
  userId: string;
}

// ─── Platform features (floating PNG illustrations) ───────────────

const FEATURES = [
  {
    title: "Layer-4 mitigation",
    desc: "TCP/UDP attack absorption at Cloudflare's edge — terabit-scale capacity, always-on.",
    image: "/images/kubernetes-ui/fully managed.png",
  },
  {
    title: "Anycast routing",
    desc: "Single anycast IP fronts your service from 300+ data centres, soaking attack traffic globally.",
    image: "/images/kubernetes-ui/Global CDN Integration.png",
  },
  {
    title: "IP allowlist & firewall",
    desc: "Per-app IP rules enforce who can reach your origin — block, allow, or challenge inline.",
    image: "/images/kubernetes-ui/Built in load balancing png.png",
  },
  {
    title: "Proxy protocol support",
    desc: "Preserve client source IPs end-to-end via PROXY v1/v2 — no NAT hops, real audit trails.",
    image: "/images/kubernetes-ui/gitops ready.png",
  },
  {
    title: "Multi-region failover",
    desc: "Route around regional outages automatically — origin pools live in any supported region.",
    image: "/images/kubernetes-ui/Multi region clusters png.png",
  },
  {
    title: "99.99% uptime SLA",
    desc: "Always-on protection with audit logs, real-time alerting, and per-application metrics.",
    image: "/images/kubernetes-ui/11 nine.png",
  },
] as const;

const NetworkDDoSMain = ({ spectrumApps, userId }: NetworkDDoSMainProps) => {
  const stats = useMemo(() => {
    const activeApps = spectrumApps.filter(
      (app) => app.status === "created" || app.status === "updated",
    ).length;
    const firewallEnabled = spectrumApps.filter((app) => app.ip_firewall).length;
    const trafficProfiles = new Set(
      spectrumApps.map((app) => app.traffic_type || "direct").filter(Boolean),
    ).size;
    return {
      totalApplications: spectrumApps.length,
      activeApps,
      firewallEnabled,
      trafficProfiles,
    };
  }, [spectrumApps]);

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[900px] w-[900px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.08), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
        {/* Hero */}
        <header className="mb-14">
          <div className="max-w-2xl">
            <h1 className="text-[40px] sm:text-[52px] leading-[1.02] tracking-[-0.03em] text-white font-semibold">
              Layer-4 DDoS{" "}
              <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                protection for critical traffic
              </span>
            </h1>
            <p
              className={`${MONO} mt-4 max-w-md text-[11.5px] text-white/45 leading-relaxed`}
            >
              Protect TCP and UDP workloads with Cloudflare Spectrum.
              Anycast routing, per-app firewalls, and end-to-end PROXY
              protocol support.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Link
                href="/dashboard/services/network-ddos/new"
                className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                style={{
                  background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                  color: "#ffffff",
                  boxShadow:
                    "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                  e.currentTarget.style.transform = "none";
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Protect application
              </Link>
              <Link
                href="#inventory"
                className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[5px] transition-colors`}
              >
                View inventory
              </Link>
            </div>
          </div>
        </header>

        {/* Stats — horizontal divider strip */}
        <section className="mb-16 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
          <StatCell
            label="Protected apps"
            value={String(stats.totalApplications)}
            hint="Spectrum configurations"
          />
          <StatCell
            label="Active"
            value={String(stats.activeApps)}
            suffix={
              stats.totalApplications > 0
                ? `/ ${stats.totalApplications}`
                : undefined
            }
            hint="Provisioned and serving"
            accent="#4ade80"
          />
          <StatCell
            label="IP firewall"
            value={String(stats.firewallEnabled)}
            hint="Apps with allowlists"
            accent={ACCENT}
          />
          <StatCell
            label="Traffic profiles"
            value={String(stats.trafficProfiles || 0)}
            hint="Distinct routing modes"
          />
        </section>

        {/* Inventory (front and centre) */}
        <div id="inventory" className="mb-16">
          <SectionHead
            eyebrow="Protection inventory"
            title="Your"
            accent="applications"
            rightMeta={
              stats.totalApplications > 0
                ? `${stats.activeApps} active · ${stats.totalApplications} total`
                : undefined
            }
          />
          <SpectrumAppsTable spectrumApps={spectrumApps} userId={userId} />
        </div>

        {/* Platform features */}
        <SectionHead
          eyebrow="Why managed DDoS"
          title="Engineered"
          accent="for the edge"
          link={{ label: "Read the docs", href: "#" }}
        />
        <div className="mb-16 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6">
          {FEATURES.map((f, i) => (
            <FeatureCell key={f.title} index={i} {...f} />
          ))}
        </div>

        <style>{`
          @keyframes floaty {
            0%, 100% { transform: translateY(0px); }
            50%      { transform: translateY(-6px); }
          }
        `}</style>

      </div>
    </div>
  );
};

export default NetworkDDoSMain;

// ─── Subcomponents ─────────────────────────────────────────────────

function SectionHead({
  eyebrow,
  title,
  accent,
  link,
  rightMeta,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  link?: { label: string; href: string };
  rightMeta?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}
        >
          {eyebrow}
        </p>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {title}{" "}
          <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
            {accent}
          </span>
        </h2>
      </div>
      <div className="flex items-center gap-4">
        {rightMeta && (
          <span
            className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 tabular-nums`}
          >
            {rightMeta}
          </span>
        )}
        {link && (
          <Link
            href={link.href}
            className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/50 hover:text-[#0095FF] transition-colors`}
          >
            {link.label}
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  suffix,
  hint,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="px-5 py-5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className="h-1 w-1 rounded-full shrink-0"
          style={{
            background: accent ?? "rgba(255,255,255,0.55)",
            boxShadow: accent ? `0 0 5px ${accent}` : "none",
          }}
        />
        <span
          className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
        >
          {value}
        </span>
        {suffix && (
          <span
            style={SERIF_STYLE}
            className="text-[16px] text-white/40 font-medium"
          >
            {suffix}
          </span>
        )}
      </div>
      <p className={`${MONO} text-[10.5px] text-white/40`}>{hint}</p>
    </div>
  );
}

function FeatureCell({
  index,
  title,
  desc,
  image,
}: {
  index: number;
  title: string;
  desc: string;
  image: string;
}) {
  return (
    <div className="flex items-start gap-4 py-2">
      <div
        className="relative h-20 w-20 shrink-0 flex items-center justify-center"
        style={{
          animation: `floaty 5s ease-in-out infinite ${(index % 6) * 0.5}s`,
        }}
      >
        <div
          className="absolute inset-0 blur-xl opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.18), transparent 60%)",
          }}
        />
        <Image
          src={image}
          alt=""
          width={80}
          height={80}
          className="relative object-contain"
          unoptimized
        />
      </div>
      <div className="min-w-0 pt-1.5">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">
          {title}
        </h3>
        <p className="text-[12px] text-white/55 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
