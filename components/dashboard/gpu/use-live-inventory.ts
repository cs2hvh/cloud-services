"use client";

// Live GPU inventory hook. Keeps stock fresh in real time the way RunPod's
// console does — without relying on a cron worker. Strategy:
//
//   1. While the page is visible, hit POST /api/services/gpu/sync every
//      KEEPALIVE_INTERVAL_MS. The endpoint is NX-locked at 6s so concurrent
//      callers coalesce.
//   2. Subscribe to Supabase realtime on `gpu_inventory_snapshots`. The sync
//      writes one row per (gpu, cloudType) per cycle — that's our signal to
//      pull the latest snapshot from `/api/services/gpu/inventory`.
//   3. Fallback poll every FALLBACK_POLL_MS so the UI still updates if the
//      realtime channel drops or stalls.
//   4. Stop everything when the tab is hidden, restart on focus + sync once
//      immediately so users see fresh data the moment they look at the tab.

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import type { InventoryRowClient } from "./types";

const KEEPALIVE_INTERVAL_MS = 6_000;
const FALLBACK_POLL_MS = 12_000;
const REFETCH_DEBOUNCE_MS = 350;

interface UseLiveInventoryResult {
    inventory: InventoryRowClient[];
    loading: boolean;
    error: string | null;
    lastUpdatedAt: Date | null;
    forceRefresh: () => void;
}

export function useLiveInventory(): UseLiveInventoryResult {
    const [inventory, setInventory] = useState<InventoryRowClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
    const supabase = createClient();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadInventory = useCallback(async (silent: boolean) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch("/api/services/gpu/inventory", { cache: "no-store" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || "Load failed");
            setInventory(json.inventory as InventoryRowClient[]);
            setLastUpdatedAt(new Date());
            setError(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed";
            if (!silent) setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    const triggerSync = useCallback(async () => {
        try {
            await fetch("/api/services/gpu/sync", { method: "POST", cache: "no-store" });
        } catch {
            // Network blip — realtime / fallback poll will catch up later.
        }
    }, []);

    const scheduleReload = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadInventory(true), REFETCH_DEBOUNCE_MS);
    }, [loadInventory]);

    const forceRefresh = useCallback(() => {
        triggerSync();
        loadInventory(false);
    }, [triggerSync, loadInventory]);

    // Initial load + initial sync kick.
    useEffect(() => {
        loadInventory(false);
        triggerSync();
    }, [loadInventory, triggerSync]);

    // Realtime subscription on snapshot inserts — sync writes one row per
    // (gpu, cloud) per cycle, so any insert is a signal that fresh data exists.
    useEffect(() => {
        const channel = supabase
            .channel("gpu-inventory-live")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "gpu_inventory_snapshots" },
                () => scheduleReload()
            )
            .subscribe();
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Visibility-aware loops: keepalive sync + fallback poll only while
    // the tab is visible. On re-focus, sync + reload immediately.
    useEffect(() => {
        let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            stop();
            keepaliveTimer = setInterval(triggerSync, KEEPALIVE_INTERVAL_MS);
            pollTimer = setInterval(() => loadInventory(true), FALLBACK_POLL_MS);
        };
        const stop = () => {
            if (keepaliveTimer) clearInterval(keepaliveTimer);
            if (pollTimer) clearInterval(pollTimer);
            keepaliveTimer = null;
            pollTimer = null;
        };

        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                triggerSync();
                loadInventory(true);
                start();
            } else {
                stop();
            }
        };

        if (document.visibilityState === "visible") start();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onVisibility);

        return () => {
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", onVisibility);
        };
    }, [triggerSync, loadInventory]);

    return { inventory, loading, error, lastUpdatedAt, forceRefresh };
}
