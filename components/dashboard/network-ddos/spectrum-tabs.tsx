"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tables } from "@/lib/supabase/types";
import { Shield } from "lucide-react";
import SpectrumAppInfo from "./spectrum-info";
import SpectrumAppSettings from "./spectrum-settings";
import axios from "axios";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

interface SpectrumAppTabsProps {
  spectrumApp: Tables<"spectrum_apps">;
}

const SpectrumAppTabs = ({ spectrumApp: initialApp }: SpectrumAppTabsProps) => {
  const [spectrumApp, setSpectrumApp] = useState(initialApp);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchParams = useSearchParams();

  // Get tab from query params, default to "info"
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabParam === "settings" ? "settings" : "info"
  );

  // Update active tab when query param changes
  useEffect(() => {
    if (tabParam === "settings") {
      setActiveTab("settings");
    }
  }, [tabParam]);

  // Function to refresh spectrum app data
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
    } catch (error: any) {
      console.error("Failed to refresh app data:", error);
      toast.error("Failed to refresh app data");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Extract DNS info
  const dns = spectrumApp.dns as {
    name: unknown;
    type: string;
    decrypted_name?: string;
  } | null;
  const dnsType = dns?.type || "Unknown";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-7xl mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 sm:mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-white/80" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                Spectrum App
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-1 break-words">
                <span className="inline-block">{spectrumApp.protocol}</span>
                <span className="mx-1 hidden sm:inline">/</span>
                <span className="inline-block">{dnsType} Record</span>
                <span className="mx-1 hidden sm:inline">/</span>
                <span className="inline-block">TLS: {spectrumApp.tls}</span>
                <span className="mx-1 hidden sm:inline">/</span>
                <span className="inline-block capitalize">
                  {spectrumApp.status || "active"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 p-1 w-fit">
          <TabsTrigger
            value="info"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 data-[state=active]:shadow"
          >
            App Info
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 data-[state=active]:shadow"
          >
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 sm:mt-6">
          <SpectrumAppInfo
            spectrumApp={spectrumApp}
            isRefreshing={isRefreshing}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4 sm:mt-6">
          <SpectrumAppSettings
            spectrumApp={spectrumApp}
            onUpdate={refreshAppData}
          />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default SpectrumAppTabs;
