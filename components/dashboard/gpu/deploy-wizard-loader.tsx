"use client";

import { LoadingSpinner } from "@/components/dashboard/utils/loading";

import DeployWizard from "./deploy-wizard";
import { useLiveInventory } from "./use-live-inventory";

export default function DeployWizardLoader() {
    const { inventory, loading, error } = useLiveInventory();

    if (loading && inventory.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
            </div>
        );
    }

    if (error && inventory.length === 0) {
        return (
            <div className="border border-red-500/20 bg-red-500/[0.06] px-5 py-5">
                <p className="text-sm font-semibold text-red-400">
                    Unable to load GPU inventory
                </p>
                <p className="mt-1 text-sm text-white/45">{error}</p>
            </div>
        );
    }

    return <DeployWizard inventory={inventory} />;
}
