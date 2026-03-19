"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BuildInfo } from "@/components/dashboard/apps";
import api from "@/lib/axios/axios";

type App = {
  id: string;
  name: string;
  status: string;
};

export interface AppBuildState {
  buildInfo: Record<string, BuildInfo>;
  buildLogs: Record<string, string>;
  logsLoading: Record<string, boolean>;
  logsError: Record<string, string>;
  fetchBuildLogs: (appName: string, buildNumber: number, append?: boolean) => Promise<void>;
}

/**
 * Encapsulates all Jenkins build state management for the apps listing page:
 * - Initial build info fetch per app
 * - 5-second polling for active builds (status + logs)
 * - Incremental log streaming with byte-offset tracking
 * - Build-start cache eviction with generation-safe guard (justStartedBuildingRef)
 * - Stale-build reconciliation via the health endpoint (BuildPollingService crash recovery)
 * - Supabase-authoritative completion: immediately clears building flag when Supabase
 *   says running/failed, without waiting for the next Jenkins poll
 * - Completion log swap: replaces raw streaming logs with deployment-filtered view
 */
export function useAppBuildState(deployedApps: App[]): AppBuildState {
  const [buildInfo, setBuildInfo] = useState<Record<string, BuildInfo>>({});
  const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
  const [fetchedBuilds, setFetchedBuilds] = useState<Set<string>>(new Set());
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [logsError, setLogsError] = useState<Record<string, string>>({});

  // Per-app byte offset for incremental log fetches during active builds
  const logOffsetRef = useRef<Record<string, number>>({});
  // Stable mirror of state so callbacks/intervals always see the latest values
  const buildInfoRef = useRef(buildInfo);
  buildInfoRef.current = buildInfo;
  const buildLogsRef = useRef(buildLogs);
  buildLogsRef.current = buildLogs;
  // Tracks previous buildInfo to detect building → done transitions
  const prevBuildInfoRef = useRef<Record<string, BuildInfo>>({});
  // Tracks per-app Supabase status to detect non-building → building transitions
  const prevAppStatusRef = useRef<Record<string, string>>({});
  // Apps whose Supabase status just flipped to 'building' in the current render.
  // Written synchronously by the eviction effect and read by the reconciliation effect
  // (both run in the same commit). Cleared when Jenkins confirms building=true, so
  // reconciliation can fire once the build genuinely finishes.
  // See: TOCTOU / Stale Closure problem — same pattern as RTK Query requestId fencing.
  const justStartedBuildingRef = useRef<Set<string>>(new Set());
  // Tracks which apps have already had their stale-build health check fired.
  // Optimistic add + delete-on-failure allows retry on transient 429 / network errors.
  const reconciledRef = useRef<Set<string>>(new Set());

  // ─── Fetch helpers ────────────────────────────────────────────────────────

  const fetchBuildInfo = useCallback(async (appName: string) => {
    try {
      const res = await api.get(`/jenkins/build-info?app=${appName}`, {
        validateStatus: (status) => status < 500,
      });
      if (res?.status === 200 && res?.data && !res.data.error) {
        setBuildInfo((prev) => ({ ...prev, [appName]: res.data }));
      }
    } catch (error) {
      console.log(`[useAppBuildState] Build info not available for ${appName}:`, error);
    }
  }, []);

  const fetchBuildLogs = useCallback(async (
    appName: string,
    buildNumber: number,
    append = false,
  ) => {
    if (!append) {
      setLogsLoading((prev) => ({ ...prev, [appName]: true }));
      setLogsError((prev) => ({ ...prev, [appName]: "" }));
      logOffsetRef.current[appName] = 0;
    }

    const isBuilding = buildInfoRef.current[appName]?.building;
    const start = append ? (logOffsetRef.current[appName] ?? 0) : 0;

    // While building: raw progressive logs show all stages (scheduling, cloning, etc.).
    // After build: deployment-filtered view for a clean summary.
    const url = isBuilding
      ? `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=${start}`
      : `/jenkins/build-logs?app=${appName}&build=${buildNumber}&start=0&deployment=true`;

    try {
      const res = await api.get(url);
      const chunk: string = res?.data?.logs ?? "";

      if (append) {
        if (chunk) setBuildLogs((prev) => ({ ...prev, [appName]: (prev[appName] ?? "") + chunk }));
      } else {
        setBuildLogs((prev) => ({ ...prev, [appName]: chunk || "No logs available" }));
        setLogsError((prev) => ({ ...prev, [appName]: "" }));
      }

      if (res?.data?.next_start != null) {
        logOffsetRef.current[appName] = res.data.next_start;
      }
    } catch (error) {
      console.error(`[useAppBuildState] Failed to fetch logs for ${appName}:`, error);
      if (!append) {
        setLogsError((prev) => ({ ...prev, [appName]: "Failed to load logs. Click to retry." }));
      }
    } finally {
      if (!append) setLogsLoading((prev) => ({ ...prev, [appName]: false }));
    }
  }, []);

  // ─── Effect 1: Initial build info fetch ───────────────────────────────────
  // Fires once per app when it first appears in deployedApps.

  useEffect(() => {
    deployedApps.forEach((app) => {
      if (app.status === "pending" || app.status === "deleting") return;
      if (!fetchedBuilds.has(app.name)) {
        fetchBuildInfo(app.name);
        setFetchedBuilds((prev) => new Set(prev).add(app.name));
      }
    });
  }, [deployedApps, fetchedBuilds, fetchBuildInfo]);

  // ─── Effect 2: Build-start cache eviction ─────────────────────────────────
  // When Supabase transitions an app into 'building', the cached Jenkins buildInfo
  // belongs to the previous build and must be evicted. Without eviction, the
  // reconciliation effect (Effect 3) would see the stale {building:false} entry
  // and fire force=true against a genuinely-starting build, potentially flipping
  // its DB status to 'running/failed' based on transient K8s pod state.
  //
  // justStartedBuildingRef is written synchronously here and read by Effect 3
  // (both run in the same React commit). setBuildInfo is async (schedules re-render),
  // so the ref is the only reliable synchronous signal between the two effects.

  useEffect(() => {
    deployedApps.forEach((app) => {
      const prev = prevAppStatusRef.current[app.id];
      if (app.status === "building" && prev !== undefined && prev !== "building") {
        setBuildInfo((curr) => {
          const updated = { ...curr };
          delete updated[app.name];
          return updated;
        });
        reconciledRef.current.delete(app.id);
        justStartedBuildingRef.current.add(app.id);
      }
      prevAppStatusRef.current[app.id] = app.status;
    });
  }, [deployedApps]);

  // ─── Effect 3: Stale-build reconciliation ─────────────────────────────────
  // If the DB says 'building' but BuildPollingService died before writing the
  // final status (dev server restart, process crash), the status stays stale
  // forever. Once Jenkins confirms the build finished (building=false), call the
  // health endpoint with force=true to let the server check actual K8s pod state
  // and write the corrected status. Supabase Realtime then pushes the fix to the UI.
  //
  // justStartedBuildingRef prevents firing during the window between Supabase
  // pushing 'building' and Jenkins returning building=true — see Effect 2.

  useEffect(() => {
    deployedApps.forEach((app) => {
      if (app.status !== "building" || reconciledRef.current.has(app.id)) return;

      const info = buildInfo[app.name];

      // Jenkins confirmed build is active — the justStartedBuilding guard is no
      // longer needed. Clear it so reconciliation can fire when the build finishes.
      if (info?.building) {
        justStartedBuildingRef.current.delete(app.id);
        return;
      }

      if (info && !info.building && !justStartedBuildingRef.current.has(app.id)) {
        reconciledRef.current.add(app.id);
        api
          .get(`/services/platform-apps/health?app_id=${app.id}&force=true`)
          .catch(() => {
            // Allow retry on transient failure (429, network blip)
            reconciledRef.current.delete(app.id);
          });
      }
    });
  }, [deployedApps, buildInfo]);

  // ─── Effect 4: Supabase-authoritative completion ──────────────────────────
  // Supabase's realtime push arrives faster than the 5-second Jenkins poll.
  // When an app's status flips to running/failed, immediately clear the local
  // buildInfo.building flag so the badge and polling stop without waiting for
  // the next Jenkins tick. This also triggers Effect 6 (completion log swap).

  useEffect(() => {
    let anyChanged = false;
    const next = { ...buildInfoRef.current };

    deployedApps.forEach((app) => {
      const build = next[app.name];
      if (build?.building && (app.status === "running" || app.status === "failed")) {
        next[app.name] = { ...build, building: false };
        anyChanged = true;
      }
    });

    if (anyChanged) setBuildInfo(next);
  }, [deployedApps]);

  // ─── Effect 5: Active-build polling ──────────────────────────────────────
  // Polls Jenkins every 5 s for apps that are building. Refreshes both build
  // status and (for expanded cards) streaming logs.
  // 5 s is intentional for the listing page — lower frequency reduces API load
  // when tracking multiple apps simultaneously. The detail page uses 2 s (faster
  // perceived updates for a single focused build).

  useEffect(() => {
    const buildingApps = deployedApps.filter((app) => {
      const build = buildInfo[app.name];
      return build?.building || app.status === "building";
    });

    if (buildingApps.length === 0) return;

    const interval = setInterval(() => {
      buildingApps.forEach((app) => {
        fetchBuildInfo(app.name);

        const currentBuild = buildInfoRef.current[app.name];
        if (currentBuild?.number && app.name in buildLogsRef.current) {
          fetchBuildLogs(app.name, currentBuild.number, true);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [deployedApps, buildInfo, fetchBuildInfo, fetchBuildLogs]);

  // ─── Effect 6: Completion log swap ───────────────────────────────────────
  // When a build transitions building → done, replace raw streaming logs with
  // the deployment-filtered view for any card that was already expanded.

  useEffect(() => {
    Object.entries(buildInfo).forEach(([appName, info]) => {
      const wasBuilding = prevBuildInfoRef.current[appName]?.building;
      if (wasBuilding && !info.building && info.number && appName in buildLogsRef.current) {
        fetchBuildLogs(appName, info.number, false);
      }
    });
    prevBuildInfoRef.current = buildInfo;
  }, [buildInfo, fetchBuildLogs]);

  return { buildInfo, buildLogs, logsLoading, logsError, fetchBuildLogs };
}
