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
 * Encapsulates all Jenkins build state management for the apps listing page.
 *
 * Design principles
 * ─────────────────
 * 1. Polling intervals are "daemons" — created once, never restarted by volatile
 *    data (buildInfo state, Supabase pushes). They read live values from refs
 *    inside their callbacks.  Only stable callbacks (fetchBuildInfo / fetchBuildLogs,
 *    which never change identity) and component unmount touch the intervals.
 *
 * 2. All guards are refs, not state. Nothing that is purely a side-effect guard
 *    (fetchedBuilds, reconciledRef, justStartedBuildingRef) triggers a re-render.
 *
 * 3. The reconciliation effect (Effect 3) reads buildInfoRef inside, so it only
 *    needs to re-run when Supabase pushes a new app status — not on every Jenkins
 *    poll response.
 *
 * Effects summary
 * ───────────────
 * Effect 1 – Initial fetch (once per app, ref-guarded)
 * Effect 2 – Cache eviction on build-start (Supabase "building" transition)
 * Effect 3 – Stale-build reconciliation (recover-build endpoint)
 * Effect 4 – Active-build daemon: polls Jenkins every 5 s (never restarts)
 * Effect 5 – Idle daemon: polls Jenkins every 15 s for non-building apps (never restarts)
 * Effect 6 – Completion log swap (building → done transition)
 */
export function useAppBuildState(deployedApps: App[]): AppBuildState {
  const [buildInfo, setBuildInfo] = useState<Record<string, BuildInfo>>({});
  const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [logsError, setLogsError] = useState<Record<string, string>>({});

  // ─── Refs ────────────────────────────────────────────────────────────────

  // Stable mirrors of state — always current inside interval callbacks
  const buildInfoRef = useRef(buildInfo);
  buildInfoRef.current = buildInfo;
  const buildLogsRef = useRef(buildLogs);
  buildLogsRef.current = buildLogs;
  // Stable mirror of the apps prop — updated synchronously on every render
  const deployedAppsRef = useRef(deployedApps);
  deployedAppsRef.current = deployedApps;

  // Per-app byte offset for incremental log streaming
  const logOffsetRef = useRef<Record<string, number>>({});
  // Tracks previous buildInfo to detect building → done transitions (Effect 6)
  const prevBuildInfoRef = useRef<Record<string, BuildInfo>>({});
  // Tracks per-app Supabase status to detect non-building → building transitions (Effect 2)
  const prevAppStatusRef = useRef<Record<string, string>>({});

  // Guard: apps whose Supabase status just flipped to 'building'.
  // Written synchronously by Effect 2, read by Effect 3.
  // Prevents reconciliation from firing on a genuinely starting build before
  // Jenkins has had a chance to confirm building=true.
  const justStartedBuildingRef = useRef<Set<string>>(new Set());

  // Guard: apps already scheduled for stale-build recovery.
  // Optimistic add + delete-on-failure allows retry on transient errors.
  const reconciledRef = useRef<Set<string>>(new Set());

  // Guard: apps already fetched on initial mount (replaces fetchedBuilds state).
  // Using a ref avoids the extra re-render that a state-based guard would cause.
  const fetchedBuildsRef = useRef<Set<string>>(new Set());

  // ─── Fetch helpers ────────────────────────────────────────────────────────

  const fetchBuildInfo = useCallback(async (appName: string) => {
    try {
      const res = await api.get(`/jenkins/build-info?app=${appName}`, {
        validateStatus: (s) => s < 500,
      });
      if (res?.status === 200 && res?.data && !res.data.error) {
        setBuildInfo((prev) => ({ ...prev, [appName]: res.data }));
      }
    } catch {
      // Non-critical — will be retried on the next poll tick
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

    // While building: raw progressive logs (all stages).
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
    } catch {
      if (!append) {
        setLogsError((prev) => ({ ...prev, [appName]: "Failed to load logs. Click to retry." }));
      }
    } finally {
      if (!append) setLogsLoading((prev) => ({ ...prev, [appName]: false }));
    }
  }, []);

  // ─── Effect 1: Initial build info fetch ───────────────────────────────────
  // Fires once per app when it first appears in deployedApps.
  // Uses a ref guard (fetchedBuildsRef) — no state update, no extra re-render.

  useEffect(() => {
    deployedApps.forEach((app) => {
      if (app.status === "pending" || app.status === "deleting") return;
      if (!fetchedBuildsRef.current.has(app.name)) {
        fetchedBuildsRef.current.add(app.name);
        fetchBuildInfo(app.name);
      }
    });
  }, [deployedApps, fetchBuildInfo]);

  // ─── Effect 2: Build-start cache eviction ─────────────────────────────────
  // When Supabase transitions an app into 'building', the cached Jenkins buildInfo
  // belongs to the previous build and must be evicted. Without eviction, Effect 3
  // would see the stale {building:false} entry and fire a spurious recover-build call.
  //
  // justStartedBuildingRef is written synchronously here and read by Effect 3 (both
  // run in the same React commit). setBuildInfo is async (schedules a re-render), so
  // the ref is the only reliable synchronous signal between these two effects.

  useEffect(() => {
    deployedApps.forEach((app) => {
      const prev = prevAppStatusRef.current[app.id];
      if (app.status === "building" && prev !== undefined && prev !== "building") {
        setBuildInfo((curr) => {
          const next = { ...curr };
          delete next[app.name];
          return next;
        });
        setBuildLogs((curr) => {
          const next = { ...curr };
          delete next[app.name];
          return next;
        });
        logOffsetRef.current[app.name] = 0;
        reconciledRef.current.delete(app.id);
        justStartedBuildingRef.current.add(app.id);
      }
      prevAppStatusRef.current[app.id] = app.status;
    });
  }, [deployedApps]);

  // ─── Effect 3: Stale-build reconciliation ─────────────────────────────────
  // If the DB says 'building' but BuildPollingService died before writing the final
  // status, the status stays stale forever. Once Jenkins confirms building=false,
  // call recover-build so the backend re-runs the canonical recovery path. Supabase
  // Realtime then pushes the corrected deployment/app state to the UI.
  //
  // justStartedBuildingRef prevents misfiring during the window between Supabase
  // pushing 'building' and Jenkins returning building=true.
  //
  // buildInfoRef is read *inside* (not in deps) so this effect only re-runs when
  // deployedApps changes (Supabase push), not on every Jenkins poll response.

  useEffect(() => {
    deployedApps.forEach((app) => {
      if (app.status !== "building" || reconciledRef.current.has(app.id)) return;

      const info = buildInfoRef.current[app.name];

      if (info?.building) {
        // Jenkins confirmed active — clear the guard so reconciliation can fire
        // once the build genuinely finishes.
        justStartedBuildingRef.current.delete(app.id);
        return;
      }

      if (info && !info.building && !justStartedBuildingRef.current.has(app.id)) {
        reconciledRef.current.add(app.id);
        api
          .post('/services/platform-apps/recover-build', { app_id: app.id })
          .then((res) => {
            if (!res.data?.recovered) reconciledRef.current.delete(app.id);
          })
          .catch(() => {
            // Allow retry on transient failure (429, network blip)
            reconciledRef.current.delete(app.id);
          });
      }
    });
  }, [deployedApps]);
  // Note: buildInfo intentionally NOT in deps — read via buildInfoRef inside.

  // ─── Effect 4: Active-build daemon (5 s) ─────────────────────────────────
  // Single persistent interval. Reads deployedAppsRef and buildInfoRef inside the
  // callback — never restarts due to Supabase pushes or Jenkins state changes.
  // Only the stable callback identities (fetchBuildInfo, fetchBuildLogs) and
  // component unmount affect this interval.
  //
  // 5 s is intentional for the listing page. The detail page uses 2 s (higher
  // frequency for a single focused build).

  useEffect(() => {
    const interval = setInterval(() => {
      deployedAppsRef.current.forEach((app) => {
        const build = buildInfoRef.current[app.name];
        const isBuilding = build?.building || app.status === "building";
        if (!isBuilding) return;

        fetchBuildInfo(app.name);

        if (build?.number && app.name in buildLogsRef.current) {
          fetchBuildLogs(app.name, build.number, true);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchBuildInfo, fetchBuildLogs]);

  // ─── Effect 5: Idle daemon (15 s) ─────────────────────────────────────────
  // Detects builds that Jenkins started but Supabase hasn't reflected yet.
  // Once Jenkins confirms building=true, Effect 4 takes over with the fast loop.
  //
  // Uses deployedAppsRef inside (not in deps) so Supabase realtime updates do NOT
  // reset the 15 s timer. The interval runs to completion on every cycle regardless
  // of how many Supabase events arrive.

  useEffect(() => {
    const interval = setInterval(() => {
      deployedAppsRef.current.forEach((app) => {
        if (app.status === "pending" || app.status === "deleting") return;
        const build = buildInfoRef.current[app.name];
        if (!build?.building && app.status !== "building") {
          fetchBuildInfo(app.name);
        }
      });
    }, 15_000);

    return () => clearInterval(interval);
  }, [fetchBuildInfo]);

  // ─── Effect 6: Completion log swap ────────────────────────────────────────
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
