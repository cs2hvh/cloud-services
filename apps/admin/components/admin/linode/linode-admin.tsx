"use client";

// Unified Linode admin console — tabbed: Overview / Plans / Regions / Images /
// Instances. Overview owns the integration status, catalog sync, deploy
// kill-switch and provider routing; the other tabs manage the resold catalog
// and inspect live instances. Mirrors game-admin-console.tsx.

import { useState } from "react";
import { BarChart3, Boxes, Globe2, HardDrive, Tag } from "lucide-react";

import OverviewTab from "@admin/components/admin/linode/overview-tab";
import RegionsTab from "@admin/components/admin/linode/regions-tab";
import ImagesTab from "@admin/components/admin/linode/images-tab";
import InstancesTab from "@admin/components/admin/linode/instances-tab";

type Tab = "overview" | "plans" | "regions" | "images" | "instances";

const TABS: { id: Tab; label: string; icon: typeof Tag }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "plans", label: "Plans", icon: Tag },
    { id: "regions", label: "Regions", icon: Globe2 },
    { id: "images", label: "Images", icon: HardDrive },
    { id: "instances", label: "Instances", icon: Boxes },
];

export default function LinodeAdmin() {
    const [tab, setTab] = useState<Tab>("overview");

    return (
        <div>
            <div className="mb-6">
                <h1 className="font-heading text-xl font-semibold tracking-tight">Linode Console</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Resold compute catalog — sync status, plan pricing, regions, images and live
                    instances.
                </p>
            </div>

            <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[13px] font-medium transition-colors ${
                                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {t.label}
                            {active && (
                                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#3987e5]" />
                            )}
                        </button>
                    );
                })}
            </div>

            {tab === "overview" && <OverviewTab />}
            {tab === "plans" && (
                // The markup console moved to the price book so every price
                // control lives on one page. This stub keeps muscle memory
                // working instead of a vanished tab.
                <div className="rounded-xl border border-border bg-card p-6">
                    <p className="text-sm font-medium">Plan pricing moved to the price book</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        The per-type markup and floor controls (with the charge-book drift
                        column) now live on the Pricing page, compute view — one page for
                        every price on the platform.
                    </p>
                    <a
                        href="/pricing?service=compute"
                        className="mt-3 inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-[#3987e5]/50 hover:text-foreground"
                    >
                        Open compute pricing →
                    </a>
                </div>
            )}
            {tab === "regions" && <RegionsTab />}
            {tab === "images" && <ImagesTab />}
            {tab === "instances" && <InstancesTab />}
        </div>
    );
}
