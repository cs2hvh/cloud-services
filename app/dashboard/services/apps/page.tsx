"use client";

import { motion } from "motion/react";
import {
  Activity,
  Clock3,
  Loader2,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { AppsList } from "@/components/dashboard/apps";
import { useRealtimeApps } from "@/hooks/use-realtime-apps";
import { useAppBuildState } from "@/hooks/use-app-build-state";
import { createClient } from "@/lib/supabase/client";

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
          <Image src={iconSrc} alt={label} width={44} height={44} className="h-11 w-11 object-contain" />
        </div>
      </div>
    </div>
  );
}

const formatRelativeTime = (dateString?: string) => {
  if (!dateString) return "No deployments yet";

  const createdAt = new Date(dateString);
  const seconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;

  return createdAt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function ApplicationDeploymentPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [localApps, setLocalApps] = useState<typeof realtimeApps>([]);

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
      }
    };

    getUser();
  }, []);

  const {
    apps: realtimeApps,
    loading,
    connectionStatus,
  } = useRealtimeApps({
    userId: userId || "",
    enabled: !!userId,
    limit: 100,
  });

  useEffect(() => {
    setLocalApps(realtimeApps);
  }, [realtimeApps]);

  const deployedApps = localApps;

  const handleUpdateApps = (updater: (apps: typeof localApps) => typeof localApps) => {
    setLocalApps(updater);
  };

  const { buildInfo, buildLogs, logsLoading, logsError, fetchBuildLogs } =
    useAppBuildState(deployedApps);

  const runningApps = deployedApps.filter((app) => app.status === "running").length;
  const buildingApps = deployedApps.filter(
    (app) => app.status === "building" || buildInfo[app.name]?.building,
  ).length;
  const successRate =
    deployedApps.length > 0
      ? `${Math.round((runningApps / deployedApps.length) * 100)}%`
      : "100%";

  const newestDeployment = useMemo(() => {
    if (deployedApps.length === 0) {
      return null;
    }

    return [...deployedApps].sort(
      (first, second) =>
        new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
    )[0];
  }, [deployedApps]);

  const liveConnection = connectionStatus === "connected";

  if (loading && userId && deployedApps.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16 text-white">
        <div className="glass-panel w-full max-w-md p-10 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-white/70" />
          <h2 className="mt-4 text-lg font-semibold text-white">Loading application services</h2>
          <p className="mt-2 text-sm text-white/45">
            Fetching deployment inventory and current build status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
            Application Services
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Deploy and operate application workloads.
            </h1>
            <Badge
              className={
                liveConnection
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-300"
              }
            >
              <span
                className={`mr-1.5 h-2 w-2 rounded-full ${
                  liveConnection ? "bg-emerald-300 animate-pulse" : "bg-amber-300"
                }`}
              />
              {liveConnection ? "Live updates" : "Sync pending"}
            </Badge>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Manage repository-backed deployments with cleaner operational visibility, active build
            monitoring, and a focused deployment workflow.
          </p>
        </div>

        <Link
          href="/dashboard/services/apps/new"
          className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Deploy Application
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.28 }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Total Apps"
          value={deployedApps.length}
          meta="Managed deployment targets"
          iconSrc="/dashboard icons/total apps.png"
        />
        <MetricCard
          label="Healthy"
          value={runningApps}
          meta="Applications serving live traffic"
          iconSrc="/dashboard icons/healthy.png"
        />
        <MetricCard
          label="Active Builds"
          value={buildingApps}
          meta="Builds or rollouts currently in progress"
          iconSrc="/dashboard icons/active builds.png"
        />
        <MetricCard
          label="Success Rate"
          value={successRate}
          meta="Running apps relative to total inventory"
          iconSrc="/dashboard icons/sucess rate .png"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.28 }}
        className="glass-panel mb-6 overflow-hidden"
      >
        <div className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Operational View
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Keep repository delivery and runtime posture in one place.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
              Review deployment health, open builds, and the newest rollout without jumping between
              pipeline and service screens.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                <Activity className="h-3.5 w-3.5 text-blue-300" />
                Realtime status
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {liveConnection ? "Connected to deployment events" : "Reconnecting to live feed"}
              </div>
              <div className="mt-1 text-sm text-white/45">
                {liveConnection
                  ? "Inventory updates stream in as build and rollout states change."
                  : "The page remains usable while the event channel re-establishes."}
              </div>
            </div>

            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                <Clock3 className="h-3.5 w-3.5 text-blue-300" />
                Latest deployment
              </div>
              <div className="mt-2 truncate text-sm font-medium text-white">
                {newestDeployment?.name || "No applications deployed"}
              </div>
              <div className="mt-1 text-sm text-white/45">
                {newestDeployment
                  ? `Created ${formatRelativeTime(newestDeployment.created_at)}`
                  : "Deploy your first application to start building runtime history."}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.28 }}
      >
        <AppsList
          apps={deployedApps}
          loading={loading}
          buildInfo={buildInfo}
          buildLogs={buildLogs}
          logsLoading={logsLoading}
          logsError={logsError}
          onFetchLogs={fetchBuildLogs}
          onUpdateApps={handleUpdateApps}
        />
      </motion.div>
    </div>
  );
}
