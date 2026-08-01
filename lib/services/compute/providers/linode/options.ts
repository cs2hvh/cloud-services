// Linode deploy-options payload — the resell counterpart of the Proxmox
// options assembled inline in app/api/services/compute/options/route.ts.
// Consumed by the Linode deploy form (components/dashboard/compute/vps/linode.tsx).
//
// Prices on the wire are CUSTOMER prices (markup + floor already applied).
// Each plan carries its base resale price plus per-region overrides; the UI
// re-prices the plan table when the region changes.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    getLinodeCatalog,
    isTypeAvailableInRegion,
    resolveLinodePlanPrice,
    type LinodeCatalogPlan,
} from "@/lib/pricing/linode-catalog";
import { getLinodeDeployEnabled } from "@/lib/admin/platform-settings";
import { formatPlanLabel } from "@/lib/pricing/plan-display";

interface PlanPriceWire {
    hourlyUSD: number;
    monthlyUSD: number;
    backupsHourlyUSD: number | null;
    backupsMonthlyUSD: number | null;
}

export interface LinodePlanWire {
    id: string;
    label: string;
    class: string;
    vcpus: number;
    memoryMB: number;
    diskGB: number;
    transferGB: number;
    networkOutMbps: number;
    price: PlanPriceWire;
    /** Region-specific customer prices (Linode region_prices × markup). */
    regionOverrides: Record<string, PlanPriceWire>;
}

export interface LinodeComputeOptions {
    provider: "linode";
    deployEnabled: boolean;
    regions: Array<{
        id: string;
        label: string;
        country: string;
        diskEncryption: boolean;
    }>;
    images: Array<{
        id: string;
        label: string;
        vendor: string | null;
        deprecated: boolean;
    }>;
    plans: LinodePlanWire[];
    /** regionId → typeId → available */
    availability: Record<string, Record<string, boolean>>;
    sshKeys: Array<{ id: string; label: string; fingerprint: string }>;
}

function priceWire(plan: LinodeCatalogPlan, regionId: string): PlanPriceWire {
    const p = resolveLinodePlanPrice(plan, regionId);
    return {
        hourlyUSD: p.hourlyUSD,
        monthlyUSD: p.monthlyUSD,
        backupsHourlyUSD: p.backupsHourlyUSD,
        backupsMonthlyUSD: p.backupsMonthlyUSD,
    };
}

export async function getLinodeOptionsResponse(
    supabase: SupabaseClient,
    userId: string
): Promise<NextResponse> {
    const [catalog, deployEnabled, sshKeysRes] = await Promise.all([
        getLinodeCatalog(supabase),
        getLinodeDeployEnabled(),
        supabase
            .from("user_ssh_keys")
            .select("id, label, fingerprint_sha256")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
    ]);

    const plans: LinodePlanWire[] = catalog.plans.map((plan) => {
        const regionOverrides: Record<string, PlanPriceWire> = {};
        for (const rp of plan.regionPrices) {
            regionOverrides[rp.id] = priceWire(plan, rp.id);
        }
        return {
            id: plan.id,
            label: formatPlanLabel(plan.label),
            class: plan.class,
            vcpus: plan.vcpus,
            memoryMB: plan.memoryMB,
            diskGB: plan.diskGB,
            transferGB: plan.transferGB,
            networkOutMbps: plan.networkOutMbps,
            price: priceWire(plan, ""),
            regionOverrides,
        };
    });

    const availability: Record<string, Record<string, boolean>> = {};
    for (const region of catalog.regions) {
        availability[region.id] = {};
        for (const plan of catalog.plans) {
            availability[region.id][plan.id] = isTypeAvailableInRegion(
                catalog,
                plan.id,
                region.id
            );
        }
    }

    const options: LinodeComputeOptions = {
        provider: "linode",
        deployEnabled,
        regions: catalog.regions.map((r) => ({
            id: r.id,
            label: r.label,
            country: r.country,
            diskEncryption: r.capabilities.includes("Disk Encryption"),
        })),
        images: catalog.images.map((i) => ({
            id: i.id,
            label: i.label,
            vendor: i.vendor,
            deprecated: i.deprecated,
        })),
        plans,
        availability,
        sshKeys: (sshKeysRes.data ?? []).map((k) => ({
            id: String(k.id),
            label: String(k.label),
            fingerprint: String(k.fingerprint_sha256),
        })),
    };

    return NextResponse.json({ ok: true, data: options });
}
