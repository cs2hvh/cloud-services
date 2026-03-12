"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tables } from "@/lib/supabase/types";

import SpectrumAppInfo from "./spectrum-info";
import SpectrumAppSettings from "./spectrum-settings";

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

      if (response.data.local) {
        setSpectrumApp(response.data.local);
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
  const dnsName = (dns?.decrypted_name as string) || (dns?.name as string) || "Protected application";
  const statusClassName =
    spectrumApp.status === "created" || spectrumApp.status === "updated"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : spectrumApp.status === "creating"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border-white/10 bg-white/[0.05] text-white/60";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-7xl px-2 sm:px-3 lg:px-4"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Link
                href="/dashboard/services/network-ddos"
                className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to protection inventory
              </Link>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                Network Security
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Spectrum application operations and routing controls.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                Review protocol mappings, DNS posture, and protection settings from a cleaner management surface.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:min-w-[420px]">
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  DNS
                </div>
                <div className="mt-2 truncate text-sm font-semibold text-white">
                  {dnsName}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Protocol
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {spectrumApp.protocol}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Status
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize " + statusClassName}>
                    {spectrumApp.status || "active"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 capitalize">
                {dnsType} record
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                TLS {spectrumApp.tls}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-white/60">
                {spectrumApp.spectrum_id}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 border border-white/[0.08] bg-white/[0.04] p-1 sm:w-fit">
          <TabsTrigger
            value="info"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-blue-500/90 data-[state=active]:text-white text-white/60"
          >
            App Info
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-blue-500/90 data-[state=active]:text-white text-white/60"
          >
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 sm:mt-6">
          <SpectrumAppInfo spectrumApp={spectrumApp} isRefreshing={isRefreshing} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4 sm:mt-6">
          <SpectrumAppSettings spectrumApp={spectrumApp} onUpdate={refreshAppData} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default SpectrumAppTabs;
