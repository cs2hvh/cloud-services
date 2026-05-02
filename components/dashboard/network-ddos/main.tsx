"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Tables } from "@/lib/supabase/types";
import SpectrumAppsTable from "./spectrum-apps-table";

type SpectrumApp = Tables<"spectrum_apps">;

interface NetworkDDoSMainProps {
  spectrumApps: SpectrumApp[];
  userId: string;
}

function MetricCard({
  label,
  value,
  meta,
  iconSrc,
}: {
  label: string;
  value: string | number;
  meta: string;
  iconSrc: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-white/45">{meta}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center">
          <Image src={iconSrc} alt={label} width={44} height={44} className="h-11 w-11 object-contain" unoptimized />
        </div>
      </div>
    </div>
  );
}

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
    <div className="min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
        >
        <div className="max-w-3xl">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
              Network Security
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Layer 4 DDoS protection for critical traffic paths.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
              Protect TCP and UDP workloads with Cloudflare Spectrum, cleaner routing controls,
              and operator-friendly visibility across protected applications.
            </p>
          </div>

          <Link
            href="/dashboard/services/network-ddos/new"
            className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Protect Application
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.28 }}
          className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            label="Protected Apps"
            value={stats.totalApplications}
            meta="Spectrum configurations under protection"
            iconSrc="/dashboard-icons/protected-apps.png"
          />
          <MetricCard
            label="Active"
            value={stats.activeApps}
            meta="Configs currently provisioned and serving"
            iconSrc="/dashboard-icons/active-1.png"
          />
          <MetricCard
            label="IP Firewall"
            value={stats.firewallEnabled}
            meta="Apps with IP firewall controls enabled"
            iconSrc="/dashboard-icons/ip-firewall.png"
          />
          <MetricCard
            label="Traffic Profiles"
            value={stats.trafficProfiles || 0}
            meta="Distinct traffic modes across protected apps"
            iconSrc="/dashboard-icons/traffic-profiles.png"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.28 }}
          className="glass-panel overflow-hidden"
        >
          <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Protection Inventory
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Protected services, routing posture, and operational access.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                  Review Spectrum applications, protocol mappings, and protective controls from
                  a single enterprise view.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                  Cloudflare Spectrum
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                  Layer 4 reverse proxy
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                  {stats.totalApplications} total
                </span>
              </div>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <SpectrumAppsTable spectrumApps={spectrumApps} userId={userId} />
          </div>
        </motion.div>
    </div>
  );
};

export default NetworkDDoSMain;
