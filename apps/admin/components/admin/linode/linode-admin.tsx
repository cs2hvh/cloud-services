"use client";

// Unified Linode admin console — tabbed: Overview / Plans / Regions / Images /
// Instances. Overview owns the integration status, catalog sync, deploy
// kill-switch and provider routing; the other tabs manage the resold catalog
// and inspect live instances. Mirrors game-admin-console.tsx.

import { useState } from "react";
import { BarChart3, Boxes, Globe2, HardDrive, Tag } from "lucide-react";

import OverviewTab from "@admin/components/admin/linode/overview-tab";
import PlansTab from "@admin/components/admin/linode/plans-tab";
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
        <div className="mx-auto max-w-[1400px]">
            <div className="mb-6">
                <a
                    href="/dashboard/admin"
                    className="text-[12px] text-white/45 transition-colors hover:text-white"
                >
                    ← Admin
                </a>
                <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em]">Linode</h1>
                <p className="mt-1 text-[13.5px] text-white/50">
                    Resold compute catalog — sync status, plan pricing, regions, images and live
                    instances.
                </p>
            </div>

            <div className="mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.08]">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[13px] font-medium transition-colors ${
                                active ? "text-white" : "text-white/45 hover:text-white/80"
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {t.label}
                            {active && (
                                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#0095FF]" />
                            )}
                        </button>
                    );
                })}
            </div>

            {tab === "overview" && <OverviewTab />}
            {tab === "plans" && <PlansTab />}
            {tab === "regions" && <RegionsTab />}
            {tab === "images" && <ImagesTab />}
            {tab === "instances" && <InstancesTab />}
        </div>
    );
}
