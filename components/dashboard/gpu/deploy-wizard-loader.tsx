"use client";

import { useEffect, useState } from "react";

import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import DeployWizard from "./deploy-wizard";
import type { InventoryRowClient } from "./types";

export default function DeployWizardLoader() {
    const [inventory, setInventory] = useState<InventoryRowClient[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const ac = new AbortController();
        (async () => {
            try {
                const res = await fetch("/api/services/gpu/inventory", {
                    cache: "no-store",
                    signal: ac.signal,
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json.ok) {
                    throw new Error(json.error || "Unable to load inventory");
                }
                setInventory(json.inventory as InventoryRowClient[]);
            } catch (e) {
                if ((e as Error).name === "AbortError") return;
                setError(e instanceof Error ? e.message : "Failed to load");
            }
        })();
        return () => ac.abort();
    }, []);

    if (error) {
        return (
            <div className="border border-red-500/20 bg-red-500/[0.06] px-5 py-5">
                <p className="text-sm font-semibold text-red-400">
                    Unable to load GPU inventory
                </p>
                <p className="mt-1 text-sm text-white/45">{error}</p>
            </div>
        );
    }
    if (!inventory) {
        return (
            <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
            </div>
        );
    }
    return <DeployWizard inventory={inventory} />;
}
