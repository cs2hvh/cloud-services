"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Cpu,
  HardDrive,
  Loader2,
  MapPin,
  Network,
  Server,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import api from "@/lib/axios/axios";
import { Tables } from "@/lib/supabase/types";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/overview-tab";
import { NetworkTab } from "./tabs/network-tab";
import { UsersDbsTab } from "./tabs/users-dbs-tab";
import { SettingsTab } from "./tabs/settings-tab";
import { DatabaseIcon } from "./database-icon";
import {
  getAccessTabDescription,
  getAccessTabLabel,
} from "./engine-capabilities";
import {
  extractCpu,
  extractRam,
  extractRegion,
  getStorageGiB,
} from "./singledb-helpers";
import { getDatabaseErrorMessage } from "./error-messages";

interface SingleDbProps {
  databaseId: string;
  products: Tables<"products">[];
}

type TabItem = {
  value: string;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  description: string;
};

const Singledb = ({ databaseId, products }: SingleDbProps) => {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [database, setDatabase] = useState<Tables<"database_clusters"> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionTab, setConnectionTab] = useState<"public" | "private">(
    "public"
  );
  const [activeTab, setActiveTab] = useState<string>(tabParam || "overview");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownOnlineToast = useRef(false);
  const previousStatus = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchDatabaseCluster = useCallback(async () => {
    if (isFetchingRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;

      const response = await api.post(`/services/database/read/`, {
        id: databaseId,
        checkStatus: true,
      });

      if (response.status === 200) {
        const dbData = response.data.data;
        setDatabase(dbData);
        setLoading(false);

        const wasProvisioning =
          previousStatus.current === "creating" ||
          previousStatus.current === "migrating";
        const isNowOnline = dbData.status === "online";

        if (isNowOnline && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        if (wasProvisioning && isNowOnline && !hasShownOnlineToast.current) {
          toast.success("Database cluster is now online!");
          hasShownOnlineToast.current = true;
        }

        previousStatus.current = dbData.status;
        return dbData.status;
      }
    } catch (error) {
      console.error("[fetchDatabaseCluster] Error:", error);
      toast.error(
        getDatabaseErrorMessage(error, "Failed to load database details.")
      );
      setLoading(false);
    } finally {
      isFetchingRef.current = false;
    }
  }, [databaseId]);

  useEffect(() => {
    const initializePolling = async () => {
      const currentStatus = await fetchDatabaseCluster();

      if (currentStatus !== "online") {
        intervalRef.current = setInterval(() => {
          fetchDatabaseCluster();
        }, 60000);
      }
    };

    initializePolling();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchDatabaseCluster]);

  useEffect(() => {
    if (database?.status !== "online" && activeTab !== "overview") {
      setActiveTab("overview");
    }
  }, [activeTab, database?.status]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard!`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const statusConfig = useMemo(() => {
    const status = database?.status ?? "failed";

    if (status === "online") {
      return {
        label: "Online",
        tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
        icon: CheckCircle2,
      };
    }

    if (status === "creating" || status === "migrating") {
      return {
        label: status === "migrating" ? "Migrating" : "Provisioning",
        tone: "border-amber-400/20 bg-amber-500/10 text-amber-300",
        icon: Loader2,
      };
    }

    return {
      label: "Attention Required",
      tone: "border-red-400/20 bg-red-500/10 text-red-300",
      icon: AlertCircle,
    };
  }, [database?.status]);

  const allTabs = useMemo<TabItem[]>(
    () => [
      {
        value: "overview",
        label: "Overview",
        icon: Server,
        eyebrow: "Overview",
        description: "Review connectivity, status, and the deployed service profile.",
      },
      {
        value: "network",
        label: "Network",
        icon: Network,
        eyebrow: "Security",
        description: "Manage the trusted IP allowlist and inbound access posture.",
      },
      {
        value: "users-dbs",
        label: getAccessTabLabel(database?.engine),
        icon: Users,
        eyebrow: "Access",
        description: getAccessTabDescription(database?.engine),
      },
      {
        value: "settings",
        label: "Settings",
        icon: Settings2,
        eyebrow: "Operations",
        description: "Handle maintenance, sizing changes, migrations, and deletion.",
      },
    ],
    [database?.engine]
  );

  const visibleTabs = useMemo(
    () =>
      database?.status === "online"
        ? allTabs
        : allTabs.filter((tab) => tab.value === "overview"),
    [allTabs, database?.status]
  );

  const activeSection =
    visibleTabs.find((tab) => tab.value === activeTab) ?? visibleTabs[0];

  const summaryStats = useMemo(() => {
    if (!database) return [];

    return [
      {
        label: "Engine",
        value: `${database.engine?.toUpperCase() || "Managed"} ${database.version || ""}`.trim(),
        icon: Server,
      },
      {
        label: "Compute",
        value: `${extractCpu(database.size)} · ${extractRam(database.size)}`,
        icon: Cpu,
      },
      {
        label: "Storage",
        value: (() => {
          const storageGiB = getStorageGiB({
            storageSizeMib: database.storage_size_mib,
            size: database.size,
            products,
          });
          return storageGiB ? `${storageGiB} GiB` : "Managed";
        })(),
        icon: HardDrive,
      },
      {
        label: "Region",
        value: extractRegion(database.region),
        icon: MapPin,
      },
    ];
  }, [database, products]);

  if (loading) {
    return (
      <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
        <div className="glass-panel flex min-h-[320px] items-center justify-center overflow-hidden">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-400" />
            <p className="text-lg font-medium text-white">
              Loading database cluster...
            </p>
            <p className="mt-2 text-sm text-white/45">
              Fetching current status, credentials, and operational details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
        <div className="glass-panel flex min-h-[320px] items-center justify-center overflow-hidden">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
            <p className="text-lg font-medium text-white">
              Database cluster not found
            </p>
            <p className="mt-2 text-sm text-white/45">
              The requested cluster may have been removed or is no longer
              available.
            </p>
            <Link
              href="/dashboard/services/database"
              className="mt-5 inline-flex items-center gap-2 border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/82 transition-colors hover:bg-white/[0.07]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to databases
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const StatusIcon = statusConfig.icon;
  const ActiveSectionIcon = activeSection.icon;

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      <div className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/dashboard/services/database"
              className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to database inventory
            </Link>

            <div className="mt-5 flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center border border-white/[0.08] bg-white/[0.04] text-blue-300">
                <DatabaseIcon engine={database.engine} className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                  Managed Databases
                </p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {database.name}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                  {`${database.engine?.toUpperCase() || "Database"} ${database.version || ""}`.trim()}{" "}
                  cluster with {database.num_nodes} node
                  {database.num_nodes !== 1 ? "s" : ""} deployed in{" "}
                  {extractRegion(database.region)}.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Status
              </div>
              <div className="mt-2 inline-flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 border px-2.5 py-1 text-sm font-medium ${statusConfig.tone}`}
                >
                  <StatusIcon
                    className={`h-4 w-4 ${
                      database.status === "creating" || database.status === "migrating"
                        ? "animate-spin"
                        : ""
                    }`}
                  />
                  {statusConfig.label}
                </span>
              </div>
            </div>

            <div className="border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Topology
              </div>
              <div className="mt-1.5 text-lg font-semibold text-white">
                {database.num_nodes} node{database.num_nodes !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryStats.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="border border-white/[0.08] bg-white/[0.03] px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                        {item.label}
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-white">
                        {item.value}
                      </div>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-blue-300">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.24 }}
            className="space-y-4 xl:sticky xl:top-8"
          >
            <div className="glass-panel overflow-hidden">
              <div className="p-4">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Cluster Areas
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    Move between overview, access controls, identities, and
                    lifecycle operations without leaving the cluster page.
                  </p>
                </div>

                <div className="space-y-2">
                  {visibleTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.value;

                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setActiveTab(tab.value)}
                        className={`w-full border px-3 py-3 text-left transition-colors ${
                          isActive
                            ? "border-blue-400/22 bg-white/[0.04]"
                            : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center border ${
                              isActive
                                ? "border-blue-400/25 bg-white/[0.04] text-blue-200"
                                : "border-white/[0.08] bg-white/[0.03] text-white/55"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">
                              {tab.label}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-white/40">
                              {tab.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.24 }}
          >
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center border border-blue-500/16 bg-white/[0.03] text-blue-200">
                    <ActiveSectionIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      {activeSection.eyebrow}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-white">
                      {activeSection.label}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                      {activeSection.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <TabsContent value="overview" className="mt-0">
                  <OverviewTab
                    database={database}
                    products={products}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    activeTab={connectionTab}
                    setActiveTab={setConnectionTab}
                    copyToClipboard={copyToClipboard}
                  />
                </TabsContent>

                <TabsContent value="network" className="mt-0">
                  <NetworkTab
                    clusterId={database.cluster_id || ""}
                    databaseId={database.cluster_id || ""}
                    initialNetworkRules={database.network_rules}
                    onRulesUpdate={fetchDatabaseCluster}
                  />
                </TabsContent>

                <TabsContent value="users-dbs" className="mt-0">
                  <UsersDbsTab
                    clusterId={database.cluster_id || ""}
                    engine={database.engine}
                  />
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                  <SettingsTab
                    database={database}
                    onDatabaseUpdate={fetchDatabaseCluster}
                    products={products}
                  />
                </TabsContent>
              </div>
            </div>
          </motion.div>
        </div>
      </Tabs>

      {database.status !== "online" && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel overflow-hidden px-5 py-4 sm:px-6"
        >
          <div className="flex items-start gap-3">
            {database.status === "creating" || database.status === "migrating" ? (
              <Clock3 className="mt-0.5 h-5 w-5 text-amber-300" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-300" />
            )}
            <div>
              <p className="text-sm font-medium text-white">
                {database.status === "creating" || database.status === "migrating"
                  ? "Additional management tabs will appear once the cluster is online."
                  : "This cluster requires attention before full management is available."}
              </p>
              <p className="mt-1 text-sm leading-6 text-white/45">
                Overview remains available while provisioning finishes or while
                support investigates an issue with the cluster state.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Singledb;
