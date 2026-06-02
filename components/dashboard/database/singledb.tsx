"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
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
import { copyToClipboard as safeCopyToClipboard } from "@/lib/utils/safe-clipboard";
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
  description: string;
};

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";

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
        const dbData = response?.data?.data;
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
      await safeCopyToClipboard(text);
      toast.success(`${label} copied to clipboard!`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const statusMeta = useMemo(() => {
    const status = database?.status ?? "failed";

    if (status === "online") {
      return {
        label: "Online",
        color: "#4ade80",
        Icon: CheckCircle2,
        pulse: true,
        spin: false,
      };
    }

    if (status === "creating" || status === "migrating") {
      return {
        label: status === "migrating" ? "Migrating" : "Provisioning",
        color: "#fbbf24",
        Icon: Loader2,
        pulse: false,
        spin: true,
      };
    }

    return {
      label: "Attention Required",
      color: "#f87171",
      Icon: AlertCircle,
      pulse: false,
      spin: false,
    };
  }, [database?.status]);

  const allTabs = useMemo<TabItem[]>(
    () => [
      {
        value: "overview",
        label: "Overview",
        icon: Server,
        description: "Connectivity, status, and the deployed service profile.",
      },
      {
        value: "network",
        label: "Network",
        icon: Network,
        description: "Trusted IP allowlist and inbound access posture.",
      },
      {
        value: "users-dbs",
        label: getAccessTabLabel(database?.engine),
        icon: Users,
        description: getAccessTabDescription(database?.engine),
      },
      {
        value: "settings",
        label: "Settings",
        icon: Settings2,
        description: "Maintenance, sizing, migrations, and deletion.",
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

  const summaryStats = useMemo(() => {
    if (!database) return [];

    const storageGiB = getStorageGiB({
      storageSizeMib: database.storage_size_mib,
      size: database.size,
      products,
    });

    return [
      {
        label: "Engine",
        value: `${database.engine?.toUpperCase() || "Managed"} ${database.version || ""}`.trim(),
        hint: "Database engine",
        accent: ACCENT,
      },
      {
        label: "Compute",
        value: extractCpu(database.size),
        hint: extractRam(database.size),
      },
      {
        label: "Storage",
        value: storageGiB ? `${storageGiB}` : "—",
        suffix: storageGiB ? "GiB" : undefined,
        hint: storageGiB ? "Provisioned" : "Managed",
        accent: "#a78bfa",
      },
      {
        label: "Region",
        value: extractRegion(database.region),
        hint: "Deployment zone",
      },
    ];
  }, [database, products]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px]">
        <div className="space-y-6">
          <div className="h-8 w-48 animate-pulse bg-white/[0.04] rounded-[5px]" />
          <div className="h-16 w-2/3 animate-pulse bg-white/[0.04] rounded-[5px]" />
          <div className="h-24 animate-pulse border border-white/[0.06] bg-[#111216] rounded-[6px]" />
          <div className="h-64 animate-pulse border border-white/[0.06] bg-[#111216] rounded-[6px]" />
        </div>
      </div>
    );
  }

  if (!database) {
    return (
      <div className="mx-auto max-w-[900px]">
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-6 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-rose-300/70 mx-auto mb-4" />
          <p className="text-[15px] font-semibold text-white">
            Database cluster not found
          </p>
          <p className={`${MONO} mt-2 text-[11px] text-white/45`}>
            The requested cluster may have been removed or is no longer
            available.
          </p>
          <Link
            href="/dashboard/services/database"
            className={`${MONO} mt-6 inline-flex items-center gap-1.5 h-10 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
          >
            <ArrowLeft className="h-3 w-3" />
            Back to databases
          </Link>
        </div>
      </div>
    );
  }

  const StatusIcon = statusMeta.Icon;

  return (
    <div className="mx-auto max-w-[1600px] text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-10">
        <div className="max-w-3xl min-w-0">
          <Link
            href="/dashboard/services/database"
            className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
          >
            <ArrowLeft className="h-3 w-3" />
            Back to databases
          </Link>

          <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
            <span>Managed Databases</span>
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="text-white/65 truncate">{database.name}</span>
          </div>

          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 inline-flex items-center justify-center border border-white/[0.08] bg-[#111216] rounded-[6px] text-[#0095FF]">
              <DatabaseIcon engine={database.engine} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className={`${MONO} text-[28px] sm:text-[36px] leading-[1.05] tracking-[-0.015em] text-white font-semibold truncate`}>
                {database.name}
              </h1>
              <p className={`${MONO} mt-2 text-[11.5px] text-white/45 flex flex-wrap items-center gap-1.5`}>
                <span className="text-white/75 font-medium uppercase tracking-[0.06em]">
                  {database.engine?.toUpperCase() || "Database"} {database.version || ""}
                </span>
                <span className="text-white/15">·</span>
                <span className="tabular-nums">
                  {database.num_nodes} node{database.num_nodes !== 1 ? "s" : ""}
                </span>
                <span className="text-white/15">·</span>
                <span>{extractRegion(database.region)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`${MONO} inline-flex items-center gap-1.5 h-10 px-3.5 border bg-[#111216] text-[11px] uppercase tracking-[0.14em] rounded-[5px]`}
            style={{ borderColor: `${statusMeta.color}33`, color: statusMeta.color }}
          >
            {statusMeta.spin ? (
              <StatusIcon className="h-3 w-3 animate-spin" />
            ) : (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: statusMeta.color, boxShadow: `0 0 6px ${statusMeta.color}` }}
              />
            )}
            {statusMeta.label}
          </span>
        </div>
      </header>

      {/* ── Stats strip ───────────────────────────────────── */}
      <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
        {summaryStats.map((s) => (
          <StatCell
            key={s.label}
            label={s.label}
            value={s.value}
            suffix={s.suffix}
            hint={s.hint}
            accent={s.accent}
          />
        ))}
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* ── Pill nav ───────────────────────────────────── */}
        <div className="mb-10 border-b border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-1 -mb-px">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`${MONO} relative inline-flex items-center gap-1.5 px-4 py-3 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                    isActive ? "text-white" : "text-white/45 hover:text-white/75"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                  {isActive && (
                    <span
                      className="absolute left-2 right-2 -bottom-px h-[2px]"
                      style={{
                        background: ACCENT,
                        boxShadow: `0 0 8px ${ACCENT}`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
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
      </Tabs>

      {database.status !== "online" && (
        <div className="mt-10 border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex items-start gap-3">
          {database.status === "creating" || database.status === "migrating" ? (
            <Loader2 className="mt-0.5 h-4 w-4 text-amber-300 animate-spin shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 text-rose-300 shrink-0" />
          )}
          <div>
            <p className="text-[13px] font-medium text-white">
              {database.status === "creating" || database.status === "migrating"
                ? "Additional management tabs will appear once the cluster is online."
                : "This cluster requires attention before full management is available."}
            </p>
            <p className={`${MONO} mt-1.5 text-[11px] text-white/45 leading-relaxed`}>
              Overview remains available while provisioning finishes or while
              support investigates an issue with the cluster state.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Subcomponents ─────────────────────────────────────────────────

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
  hint?: string;
  accent?: string;
}) {
  const dotColor = accent ?? "rgba(255,255,255,0.35)";
  return (
    <div className="px-5 py-5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: dotColor,
            boxShadow: accent ? `0 0 6px ${dotColor}` : "none",
          }}
        />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[24px] sm:text-[28px] leading-none font-bold tabular-nums tracking-[-0.025em] text-white truncate"
        >
          {value}
        </span>
        {suffix && (
          <span
            style={SERIF_STYLE}
            className="text-[14px] text-white/45 font-medium"
          >
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className={`${MONO} text-[10.5px] text-white/40 mt-auto truncate`}>{hint}</p>
      )}
    </div>
  );
}

export default Singledb;
