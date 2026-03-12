"use client";

import { useMemo, useState } from "react";
import { Code, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppCard } from "./app-card";
import { DeleteAppModal } from "./delete-app-modal";
import { App, BuildInfo } from "./types";
import { useMultipleAppMetrics } from "@/hooks/use-app-metrics";

interface AppsListProps {
  apps: App[];
  loading: boolean;
  buildInfo: Record<string, BuildInfo>;
  buildLogs: Record<string, string>;
  logsLoading: Record<string, boolean>;
  logsError: Record<string, string>;
  onFetchLogs: (appName: string, buildNumber: number) => void;
  onUpdateApps: (updater: (apps: App[]) => App[]) => void;
}

export function AppsList({
  apps,
  loading,
  buildInfo,
  buildLogs,
  logsLoading,
  logsError,
  onFetchLogs,
  onUpdateApps,
}: AppsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState<{
    id: string;
    name: string;
    originalStatus: string;
  } | null>(null);

  const runningAppIds = useMemo(
    () => apps.filter((app) => app.status === "running").map((app) => app.id),
    [apps],
  );

  const { data: metricsData, loading: metricsLoading } = useMultipleAppMetrics({
    appIds: runningAppIds,
    enabled: runningAppIds.length > 0,
    refreshInterval: 30000,
  });

  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const runningCount = apps.filter((app) => app.status === "running").length;
  const buildingCount = apps.filter(
    (app) => app.status === "building" || buildInfo[app.name]?.building,
  ).length;

  const handleDelete = (appId: string, appName: string) => {
    const app = apps.find((item) => item.id === appId);
    setAppToDelete({
      id: appId,
      name: appName,
      originalStatus: app?.status || "running",
    });
    setDeleteModalOpen(true);
  };

  const handleDeleteStart = (appId: string) => {
    onUpdateApps((prev) =>
      prev.map((app) => (app.id === appId ? { ...app, status: "deleting" } : app)),
    );
  };

  const handleDeleteSuccess = (appId: string) => {
    onUpdateApps((prev) => prev.filter((app) => app.id !== appId));
    setAppToDelete(null);
  };

  const handleDeleteError = (appId: string) => {
    const originalStatus = appToDelete?.originalStatus || "running";
    onUpdateApps((prev) =>
      prev.map((app) => (app.id === appId ? { ...app, status: originalStatus } : app)),
    );
    setAppToDelete(null);
  };

  const handleModalOpenChange = (open: boolean) => {
    setDeleteModalOpen(open);
    if (!open) {
      setTimeout(() => setAppToDelete(null), 150);
    }
  };

  return (
    <>
      <div className="glass-panel overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Application Inventory
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Managed deployments and build activity.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                Search active services, inspect build output, and take action on each deployment from
                a single operational view.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-white/[0.05] text-white/70">
                {apps.length} {apps.length === 1 ? "app" : "apps"}
              </Badge>
              <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                {runningCount} live
              </Badge>
              <Badge className="border-blue-500/20 bg-blue-500/10 text-blue-300">
                {buildingCount} building
              </Badge>
            </div>
          </div>

          {apps.length > 0 && (
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex w-full max-w-xl items-center gap-3 border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
                <Search className="h-4 w-4 text-white/35" />
                <input
                  type="text"
                  placeholder="Search applications"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-white/45">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                  {filteredApps.length} visible
                </span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                  Logs and metrics available inline
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-white/40" />
              <h3 className="text-base font-semibold text-white">Loading deployed applications</h3>
              <p className="mt-2 max-w-md text-sm text-white/45">
                Syncing runtime state, recent builds, and deployment details.
              </p>
            </div>
          ) : apps.length > 0 ? (
            <div>
              <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {filteredApps.map((app) => {
                  const appMetrics = metricsData[app.id];

                  return (
                    <AppCard
                      key={app.id}
                      app={app}
                      build={buildInfo[app.name]}
                      logs={buildLogs[app.name]}
                      logsLoading={logsLoading[app.name]}
                      logsError={logsError[app.name]}
                      isExpanded={selectedApp === app.name}
                      onToggleLogs={() =>
                        setSelectedApp(selectedApp === app.name ? null : app.name)
                      }
                      onDelete={() => handleDelete(app.id, app.name)}
                      onFetchLogs={(buildNumber) => onFetchLogs(app.name, buildNumber)}
                      metrics={appMetrics?.metrics}
                      health={appMetrics?.health}
                      metricsLoading={metricsLoading && app.status === "running"}
                    />
                  );
                })}
              </div>

              {filteredApps.length === 0 && searchTerm && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="mb-3 h-8 w-8 text-white/20" />
                  <h3 className="text-base font-semibold text-white">No matching applications</h3>
                  <p className="mt-2 text-sm text-white/45">
                    No deployments match &quot;{searchTerm}&quot;. Try a different name or clear the filter.
                  </p>
                  <Button
                    onClick={() => setSearchTerm("")}
                    variant="outline"
                    className="mt-4 border-white/[0.14] bg-white/[0.03] text-white/80 hover:bg-white/[0.07]"
                  >
                    Clear search
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center border border-dashed border-white/[0.12] px-6 py-16 text-center">
              <Code className="mb-4 h-10 w-10 text-white/20" />
              <h3 className="text-base font-semibold text-white">No applications deployed</h3>
              <p className="mt-2 max-w-md text-sm text-white/45">
                Deploy your first repository-backed application to start tracking rollout activity,
                runtime health, and build history here.
              </p>
              <Button
                asChild
                className="mt-5 border border-blue-400/25 bg-blue-500/90 text-white hover:bg-blue-500"
              >
                <Link href="/dashboard/services/apps/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Deploy your first app
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <DeleteAppModal
        open={deleteModalOpen}
        onOpenChange={handleModalOpenChange}
        appId={appToDelete?.id || null}
        appName={appToDelete?.name || null}
        onDeleteStart={handleDeleteStart}
        onDeleteSuccess={handleDeleteSuccess}
        onDeleteError={handleDeleteError}
      />
    </>
  );
}
