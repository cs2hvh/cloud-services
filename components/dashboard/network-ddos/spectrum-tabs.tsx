"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Info, Settings } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tables } from "@/lib/supabase/types";

import SpectrumAppInfo from "./spectrum-info";
import SpectrumAppSettings from "./spectrum-settings";

const SERIF_STYLE: CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

interface SpectrumAppTabsProps {
  spectrumApp: Tables<"spectrum_apps">;
}

const SpectrumAppTabs = ({ spectrumApp: initialApp }: SpectrumAppTabsProps) => {
  const [spectrumApp, setSpectrumApp] = useState(initialApp);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabParam === "settings" ? "settings" : "info",
  );

  useEffect(() => {
    if (tabParam === "settings") {
      setActiveTab("settings");
    }
  }, [tabParam]);

  const refreshAppData = async () => {
    setIsRefreshing(true);
    try {
      const response = await axios.post("/api/services/spectrum/apps/get", {
        app_id: spectrumApp.spectrum_id,
        owner_id: spectrumApp.owner_id,
      });

      if (response?.data?.local) {
        setSpectrumApp(response?.data?.local ?? null);
      }
    } catch (error: unknown) {
      console.error("Failed to refresh app data:", error);
      toast.error("Failed to refresh app data");
    } finally {
      setIsRefreshing(false);
    }
  };

  const dns = spectrumApp.dns as {
    name: unknown;
    type: string;
    decrypted_name?: string;
  } | null;

  const dnsType = dns?.type || "Unknown";
  const dnsName =
    (dns?.decrypted_name as string) || (dns?.name as string) || "Protected application";

  const statusMeta =
    spectrumApp.status === "created" || spectrumApp.status === "updated"
      ? { color: "#4ade80", label: spectrumApp.status }
      : spectrumApp.status === "creating"
        ? { color: "#fbbf24", label: spectrumApp.status }
        : { color: "rgba(255,255,255,0.55)", label: spectrumApp.status || "active" };

  return (
    <div className="mx-auto max-w-[1600px] text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-10">
        <div className="max-w-3xl min-w-0">
          <Link
            href="/dashboard/services/network-ddos"
            className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
          >
            <ArrowLeft className="h-3 w-3" />
            Back to protection inventory
          </Link>

          <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
            <span>Network DDoS</span>
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="text-white/65 truncate">{dnsName}</span>
          </div>

          <h1 className="text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
            Spectrum{" "}
            <span style={SERIF_STYLE} className="text-white/55 font-normal">
              application
            </span>
            <span className="text-white/55 font-normal">.</span>
          </h1>
          <p className={`${MONO} mt-3 max-w-2xl text-[11.5px] text-white/45 leading-relaxed`}>
            Review protocol mappings, DNS posture, and protection settings from a cleaner management surface.
          </p>

          <div className="mt-5 flex flex-wrap gap-1.5">
            <span className={`${MONO} inline-flex items-center px-2.5 py-1 text-[10px] uppercase tracking-[0.06em] font-semibold rounded-[20px] border border-white/[0.08] bg-[#111216] text-white/65 capitalize`}>
              {dnsType} record
            </span>
            <span className={`${MONO} inline-flex items-center px-2.5 py-1 text-[10px] uppercase tracking-[0.06em] font-semibold rounded-[20px] border border-white/[0.08] bg-[#111216] text-white/65`}>
              TLS {spectrumApp.tls}
            </span>
            <span className={`${MONO} inline-flex items-center px-2.5 py-1 text-[10px] uppercase tracking-[0.06em] font-semibold rounded-[20px] border border-white/[0.08] bg-[#111216] text-white/55 tabular-nums`}>
              {spectrumApp.spectrum_id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`${MONO} inline-flex items-center gap-1.5 h-10 px-3.5 border bg-[#111216] text-[11px] uppercase tracking-[0.14em] rounded-[5px] capitalize`}
            style={{ borderColor: `${statusMeta.color}33`, color: statusMeta.color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: statusMeta.color, boxShadow: `0 0 6px ${statusMeta.color}` }}
            />
            {statusMeta.label}
          </span>
        </div>
      </header>

      {/* ── Stats strip ───────────────────────────────────── */}
      <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-3 divide-x divide-white/[0.06]">
        <div className="px-5 py-5 flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }}
            />
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
              DNS
            </span>
          </div>
          <span className={`${MONO} text-[14px] text-white font-medium truncate`}>
            {dnsName}
          </span>
        </div>
        <div className="px-5 py-5 flex flex-col gap-2">
          <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
            Protocol
          </span>
          <span
            style={SERIF_STYLE}
            className="text-[28px] leading-none font-bold tracking-[-0.025em] text-white uppercase"
          >
            {spectrumApp.protocol}
          </span>
        </div>
        <div className="px-5 py-5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: statusMeta.color, boxShadow: `0 0 6px ${statusMeta.color}` }}
            />
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
              Status
            </span>
          </div>
          <span
            style={SERIF_STYLE}
            className="text-[28px] leading-none font-bold tracking-[-0.025em] text-white capitalize"
          >
            {statusMeta.label}
          </span>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="mb-10 border-b border-white/[0.06]">
          <TabsList className="bg-transparent p-0 h-auto flex flex-wrap items-center gap-1 -mb-px">
            {[
              { value: "info", label: "App info", icon: Info },
              { value: "settings", label: "Settings", icon: Settings },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.value;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={`${MONO} relative inline-flex items-center gap-1.5 px-4 py-3 text-[11px] uppercase tracking-[0.14em] rounded-none bg-transparent transition-colors data-[state=active]:bg-transparent data-[state=active]:shadow-none ${
                    isActive ? "text-white" : "text-white/45 hover:text-white/75"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                  {isActive && (
                    <span
                      className="absolute left-2 right-2 -bottom-px h-[2px]"
                      style={{
                        background: ACCENT,
                        boxShadow: `0 0 8px ${ACCENT}`,
                      }}
                    />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="info" className="mt-0">
          <SpectrumAppInfo spectrumApp={spectrumApp} isRefreshing={isRefreshing} />
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <SpectrumAppSettings spectrumApp={spectrumApp} onUpdate={refreshAppData} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SpectrumAppTabs;
