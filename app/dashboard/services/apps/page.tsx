"use client";

import { motion } from "motion/react";
import {
  Activity,
  Clock3,
  GitBranch,
  Globe2,
  Loader2,
  Plus,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { AppsList, BuildInfo } from "@/components/dashboard/apps";
import { useRealtimeApps } from "@/hooks/use-realtime-apps";
import api from "@/lib/axios/axios";
import { createClient } from "@/lib/supabase/client";

function MetricCard({
  label,
  value,
  meta,
  icon: Icon,
  accentClassName = "text-white/60",
}: {
  label: string;
  value: string | number;
  meta: string;
  icon: LucideIcon;
  accentClassName?: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-white/45">{meta}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.06] ${accentClassName}`}
        >
          <Icon className="h-4 w-4" />
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
  const [buildInfo, setBuildInfo] = useState<Record<string, BuildInfo>>({});
  const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
  const [fetchedBuilds, setFetchedBuilds] = useState<Set<string>>(new Set());
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [logsError, setLogsError] = useState<Record<string, string>>({});
  const [localApps, setLocalApps] = useState<typeof realtimeApps>([]);

  // Per-app byte offset for incremental log fetches during active builds
  const logOffsetRef = useRef<Record<string, number>>({});
  // Stable ref to buildInfo so poll callbacks don't capture stale state
  const buildInfoRef = useRef(buildInfo);
  buildInfoRef.current = buildInfo;
  // Stable ref to buildLogs so we can check if logs have been loaded for an app
  const buildLogsRef = useRef(buildLogs);
  buildLogsRef.current = buildLogs;
  // Tracks previous buildInfo to detect building → done transitions
  const prevBuildInfoRef = useRef<Record<string, BuildInfo>>({});
  // Tracks per-app Supabase status to detect non-building → building transitions
  const prevAppStatusRef = useRef<Record<string, string>>({});
  // Apps whose Supabase status just flipped to 'building' in the current render.
  // Written synchronously by the eviction effect and read by the reconciliation effect
  // (both run in the same commit). Cleared when Jenkins confirms building=true, so the
  // reconciliation can fire once the build genuinely finishes.
  const justStartedBuildingRef = useRef<Set<string>>(new Set());
  // Tracks which apps have already had their stale-build health check fired
  const reconciledRef = useRef<Set<string>>(new Set());

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

  const fetchBuildInfo = useCallback(async (appName: string) => {
    try {
      const res = await api.get(`/jenkins/build-info?app=${appName}`, {
        validateStatus: (status) => status < 500,
      });

      if (res?.status === 200 && res?.data && !res.data.error) {
        setBuildInfo((prev) => ({ ...prev, [appName]: res.data }));
      }
    } catch (error) {
      console.log(`[fetchBuildInfo] Build info not available for ${appName}:`, error);
    }
  }, []);

  const fetchBuildLogs = useCallback(async (
    appName: string,
    buildNumber: number,
    append = false,
  ) => {
    if (!append) {
      setLogsLoading((prev) => ({ ...prev, [appName]: true }));
      setLogsError((prev) => ({ ...prev, [appName]: '' }));
      logOffsetRef.current[appName] = 0;
    }

    const isBuilding = buildInfoRef.current[appName]?.building;
    const start = append ? (logOffsetRef.current[appName] ?? 0) : 0;

    // While building: raw progressive logs show all stages (scheduling, cloning, etc.).
    // After build completes: deployment-filtered view for a clean summary.
    const url = isBuilding
      ? `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=${start}`
      : `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0&deployment=true`;

    try {
      const res = await api.get(url);
      const chunk: string = res?.data?.logs ?? '';

      if (append) {
        if (chunk) setBuildLogs((prev) => ({ ...prev, [appName]: (prev[appName] ?? '') + chunk }));
      } else {
        setBuildLogs((prev) => ({ ...prev, [appName]: chunk || 'No logs available' }));
        setLogsError((prev) => ({ ...prev, [appName]: '' }));
      }

      if (res?.data?.next_start != null) {
        logOffsetRef.current[appName] = res.data.next_start;
      }
    } catch (error) {
      console.error(`[fetchBuildLogs] Failed to fetch logs for ${appName}:`, error);
      if (!append) {
        setLogsError((prev) => ({ ...prev, [appName]: 'Failed to load logs. Click to retry.' }));
      }
    } finally {
      if (!append) setLogsLoading((prev) => ({ ...prev, [appName]: false }));
    }
  }, []);

  useEffect(() => {
    deployedApps.forEach((app) => {
      if (app.status === "pending" || app.status === "deleting") {
        return;
      }

      if (!fetchedBuilds.has(app.name)) {
        fetchBuildInfo(app.name);
        setFetchedBuilds((prev) => new Set(prev).add(app.name));
      }
    });
  }, [deployedApps, fetchedBuilds, fetchBuildInfo]);

  // Build-start cache eviction: when Supabase transitions an app from any status INTO
  // 'building', the cached Jenkins buildInfo is stale (from the previous build). Evict
  // it immediately so the stale-build reconciliation below cannot fire force=true against
  // old snapshot data — that would check K8s while pods are still deploying and
  // incorrectly flip the status to 'failed'. The polling interval repopulates buildInfo
  // with a fresh Jenkins response within 5 s, which will correctly say building=true.
  useEffect(() => {
    deployedApps.forEach((app) => {
      const prev = prevAppStatusRef.current[app.id];
      if (app.status === 'building' && prev !== undefined && prev !== 'building') {
        setBuildInfo((curr) => {
          const updated = { ...curr };
          delete updated[app.name];
          return updated;
        });
        reconciledRef.current.delete(app.id);
        // Mark synchronously so the reconciliation effect (same commit) knows this
        // app just transitioned into building and should not be force-reconciled yet.
        justStartedBuildingRef.current.add(app.id);
      }
      prevAppStatusRef.current[app.id] = app.status;
    });
  }, [deployedApps]);

  // Stale-build reconciliation: if the DB says an app is 'building' on page load,
  // the BuildPollingService may have died (dev server restart, production crash) and
  // never written the final status. Call the health endpoint once per app to let the
  // server check actual K8s pod state and correct the Supabase record. The realtime
  // subscription will push the corrected status back to the UI automatically.
  useEffect(() => {
    deployedApps.forEach((app) => {
      if (app.status === 'building' && !reconciledRef.current.has(app.id)) {
        const info = buildInfo[app.name];

        // Once Jenkins confirms the build is genuinely in-progress, the
        // justStartedBuilding guard is no longer needed — clear it so that when
        // the build eventually finishes (info.building flips back to false) the
        // reconciliation is allowed to fire.
        if (info?.building) {
          justStartedBuildingRef.current.delete(app.id);
          return;
        }

        // Only reconcile when Jenkins confirms the build is no longer in-progress
        // AND the eviction effect did not just transition this app into 'building'
        // in the same render (justStartedBuildingRef guard).
        // Without justStartedBuildingRef: setBuildInfo (eviction) is async, so
        // reconciliation here sees the stale snapshot where building=false and would
        // fire force=true against a genuinely-starting build.
        if (info && !info.building && !justStartedBuildingRef.current.has(app.id)) {
          reconciledRef.current.add(app.id);
          api.get(`/services/platform-apps/health?app_id=${app.id}&force=true`).catch(() => {
            reconciledRef.current.delete(app.id);
          });
        }
      }
    });
  }, [deployedApps, buildInfo]);

  // Supabase is authoritative on build completion — its real-time push is faster
  // than the Jenkins poll cycle. When an app's status flips to running/failed,
  // immediately clear the local buildInfo.building flag so the badge and polling
  // stop instantly without waiting for the next 5s Jenkins tick.
  // This also triggers the completion-log effect below (wasBuilding → false transition).
  useEffect(() => {
    let anyChanged = false;
    const reconciled = { ...buildInfoRef.current };

    deployedApps.forEach((app) => {
      const build = reconciled[app.name];
      if (build?.building && (app.status === 'running' || app.status === 'failed')) {
        reconciled[app.name] = { ...build, building: false };
        anyChanged = true;
      }
    });

    if (anyChanged) setBuildInfo(reconciled);
  }, [deployedApps]);

  useEffect(() => {
    const buildingApps = deployedApps.filter((app) => {
      const build = buildInfo[app.name];
      return build?.building || app.status === 'building';
    });

    if (buildingApps.length === 0) return;

    const interval = setInterval(() => {
      buildingApps.forEach((app) => {
        // Refresh build status
        fetchBuildInfo(app.name);

        // Refresh logs for apps whose logs have already been loaded (card was expanded)
        const currentBuild = buildInfoRef.current[app.name];
        if (currentBuild?.number && app.name in buildLogsRef.current) {
          fetchBuildLogs(app.name, currentBuild.number, true);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [deployedApps, buildInfo, fetchBuildInfo, fetchBuildLogs]);

  // When a build transitions from building → done, do a clean deployment-filtered
  // log replacement for any card that was already expanded. The transition effect
  // runs after React commits the new buildInfo state, so buildInfoRef.current already
  // reflects building=false — fetchBuildLogs will use the deployment=true URL correctly.
  useEffect(() => {
    Object.entries(buildInfo).forEach(([appName, info]) => {
      const wasBuilding = prevBuildInfoRef.current[appName]?.building;
      if (wasBuilding && !info.building && info.number && appName in buildLogsRef.current) {
        fetchBuildLogs(appName, info.number, false);
      }
    });
    prevBuildInfoRef.current = buildInfo;
  }, [buildInfo, fetchBuildLogs]);

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
          icon={Rocket}
          accentClassName="text-blue-300"
        />
        <MetricCard
          label="Healthy"
          value={runningApps}
          meta="Applications serving live traffic"
          icon={Globe2}
          accentClassName="text-emerald-300"
        />
        <MetricCard
          label="Active Builds"
          value={buildingApps}
          meta="Builds or rollouts currently in progress"
          icon={GitBranch}
          accentClassName="text-blue-300"
        />
        <MetricCard
          label="Success Rate"
          value={successRate}
          meta="Running apps relative to total inventory"
          icon={Activity}
          accentClassName="text-white/75"
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
