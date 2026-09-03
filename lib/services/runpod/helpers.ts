// RunPod ID mapping, pricing math, and GraphQL query builders.

import { HOURS_IN_MONTH } from "@/lib/pricing/hours";

import type { CloudType, RunPodGpuTypeLowestPrice, StockStatus } from "./types";

/**
 * Normalize RunPod's stockStatus values to our lowercase taxonomy.
 * RunPod returns "High" | "Medium" | "Low" | null; null means out of stock.
 */
export function normalizeStockStatus(
    raw: RunPodGpuTypeLowestPrice["stockStatus"] | undefined
): StockStatus {
    if (!raw) return "none";
    const v = String(raw).toLowerCase();
    if (v === "high") return "high";
    if (v === "medium") return "medium";
    if (v === "low") return "low";
    return "none";
}

/**
 * Compute the resale hourly rate for a pod.
 *
 *     resale = max(observed_runpod * markup_pct, floor) * gpu_count
 *
 * Stored on the pod record at create time and frozen for the pod's life so
 * customers aren't charged a moving rate as upstream prices fluctuate.
 */
/**
 * House markup on the provider rate. 1.0 sells GPU capacity at exactly what
 * RunPod charges us, which is the current product decision.
 *
 * The authoritative value lives in gpu_pricing.markup_pct — every server-side
 * price reads it from there. This constant exists only for the deploy wizard,
 * which quotes client-side from a live inventory row carrying no pricing
 * column, and it had the number hardcoded as 1.25 in three places. Change this
 * and gpu_pricing together or the quote drifts from what checkout charges.
 *
 * Ported from C:/cloud-services, where it was added alongside the
 * deploy-wizard edit that imports it. That wizard edit reached this repo in
 * 2a0c22f9 and this constant did not, so the import has been broken since the
 * fork point — invisible until npm install made a typecheck possible.
 *
 * (Both lanes wrote this comment independently and each recorded something the
 * other missed: the three hardcoded 1.25s, and the import broken since the
 * fork. Merged rather than picked, because dropping either loses a fact.)
 */
export const GPU_MARKUP_PCT = 1.0;

export function computeResalePerHour(args: {
    observedPerHr: number;
    markupPct: number;
    floorPerHour: number;
    gpuCount: number;
}): number {
    const { observedPerHr, markupPct, floorPerHour, gpuCount } = args;
    if (gpuCount < 1) throw new Error("gpuCount must be >= 1");
    if (observedPerHr < 0) throw new Error("observedPerHr must be >= 0");
    if (markupPct < 1) throw new Error("markupPct must be >= 1.0");
    if (floorPerHour < 0) throw new Error("floorPerHour must be >= 0");
    const perGpu = Math.max(observedPerHr * markupPct, floorPerHour);
    const total = perGpu * gpuCount;
    return Math.round(total * 10000) / 10000;
}

/**
 * Storage price for a pod's local disk (container disk + pod volume) in $/GB
 * per month. Network volumes are billed separately by their own meter, so
 * they are NOT included here.
 */
export const GPU_STORAGE_USD_PER_GB_MONTH = 0.1;

/**
 * Hourly storage cost for a pod's local disk (container disk + pod volume).
 *
 * The divisor MUST be the one billing.hours_in_month() uses, because this
 * function only quotes: the money is actually taken by the gpu_pod_storage
 * meter, which resolves usd_per_gb_month through billing.resolve_hourly_rate.
 * This divided by 730 while that divided by 720, so every pod was quoted 1.4%
 * less storage than it would have been charged. Importing the shared constant
 * is the point: whichever value the platform settles on, both sides move
 * together and cannot drift apart again.
 *
 * (Whether 720 or 730 is right is a separate, open question. lib/paas/tiers.ts
 * argues for 730 and is arithmetically correct that 720 bills 8,640 hours
 * against an 8,760-hour year. That is a pricing decision affecting every
 * monthly-priced service, not one to settle here.)
 */
export function storagePerHour(args: {
    containerDiskGb: number;
    volumeGb: number;
}): number {
    const gb = Math.max(0, args.containerDiskGb) + Math.max(0, args.volumeGb);
    const perHour = (gb * GPU_STORAGE_USD_PER_GB_MONTH) / HOURS_IN_MONTH;
    return Math.round(perHour * 10000) / 10000;
}

/**
 * GraphQL gpuTypes query for stock + price across the standard pod sizes
 * RunPod offers (1, 2, 4, 8). One query per cloudType per worker tick;
 * aliased so we can detect which counts are actually available — RunPod's
 * lowestPrice.availableGpuCounts is often null, so we probe explicitly.
 */
// RunPod's machine SKUs come in non-power-of-two sizes (some flagships expose
// 3, 5, 6, 7, 9× configurations). We probe every integer from 1 to 10 plus
// a couple of common higher counts, so the UI mirrors RunPod's "X max"
// indicator accurately.
export const PROBED_GPU_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function buildGpuTypesQuery(
    secureCloud: boolean
): {
    query: string;
    variables: Record<string, unknown>;
} {
    const probes = PROBED_GPU_COUNTS.map(
        (n) => `
                    p${n}: lowestPrice(input: { gpuCount: ${n}, secureCloud: $secureCloud }) {
                        stockStatus
                        availableGpuCounts
                        uninterruptablePrice
                        minimumBidPrice
                    }`
    ).join("");
    return {
        query: `
            query GpuTypes($secureCloud: Boolean!) {
                gpuTypes {
                    id
                    displayName
                    memoryInGb
                    secureCloud
                    communityCloud${probes}
                }
            }
        `,
        variables: { secureCloud },
    };
}

export function cloudTypeToSecureBool(cloudType: CloudType): boolean {
    return cloudType === "SECURE";
}

/**
 * Deterministic short slug for a RunPod gpu type id, used as gpu_catalog.id
 * for auto-discovered GPUs.
 *
 *   "NVIDIA H100 80GB HBM3"           → "h100-80gb-hbm3"
 *   "NVIDIA GeForce RTX 4090"         → "geforce-rtx-4090-24"
 *   "AMD Instinct MI300X OAM"         → "amd-instinct-mi300x-oam-192"
 */
export function slugifyGpuId(runpodId: string, memoryInGb: number): string {
    let slug = runpodId
        .toLowerCase()
        .replace(/^nvidia\s+/i, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (!new RegExp(`(^|-)${memoryInGb}(-|$)`).test(slug)) {
        slug = `${slug}-${memoryInGb}`;
    }
    return slug.slice(0, 64);
}

/**
 * Coarse tier classification for auto-discovered GPUs. Drives UI grouping +
 * default markup application if we ever stratify pricing.
 */
export function inferGpuTier(
    runpodId: string,
    displayName: string
): "flagship" | "prosumer" | "workstation" {
    const text = `${runpodId} ${displayName}`.toLowerCase();
    if (/\b(h100|h200|b100|b200|b300|gb200|a100|mi300|mi325)\b/.test(text)) {
        return "flagship";
    }
    if (/\b(rtx\s*pro\s*6000|rtx\s*6000\s*ada|a6000|a40)\b/.test(text)) {
        return "workstation";
    }
    if (/\b(rtx|geforce|l40|l4)\b/.test(text)) {
        return "prosumer";
    }
    return "workstation";
}

/**
 * Sort order used in the inventory grid + wizard. Lower = shown first.
 * Picks a slot from a hand-tuned table for known families; falls back to a
 * memory-based bucket so unknown GPUs still land in a sensible position.
 */
export function inferSortOrder(runpodId: string, memoryInGb: number): number {
    const lower = `${runpodId}`.toLowerCase();
    if (lower.includes("b300")) return 5;
    if (lower.includes("b200")) return 15;
    if (lower.includes("b100")) return 25;
    if (lower.includes("h200 nvl")) return 35;
    if (lower.includes("h200")) return 40;
    if (lower.includes("h100 nvl")) return 45;
    if (lower.includes("h100")) return 50;
    if (lower.includes("gb200")) return 60;
    if (lower.includes("a100")) return 80;
    if (lower.includes("rtx pro 6000") || lower.includes("rtx 6000 ada")) return 100;
    if (lower.includes("l40")) return 110;
    if (lower.includes("rtx 5090")) return 130;
    if (lower.includes("rtx 4090")) return 140;
    if (lower.includes("a6000")) return 150;
    if (lower.includes("a40")) return 160;
    if (lower.includes("rtx") || lower.includes("geforce")) return 200;
    if (lower.includes("l4")) return 210;
    if (lower.includes("t4")) return 230;
    if (lower.includes("v100")) return 240;
    if (lower.includes("amd") || lower.includes("mi300")) return 260;
    // Fallback: more VRAM ⇒ higher sort priority (lower number).
    return Math.max(60, 300 - Math.min(300, memoryInGb));
}

/**
 * Merge availability signals from a multi-probe RunPod response.
 *
 * For each probed gpuCount we receive a `lowestPrice` block. We treat a
 * non-"none" stockStatus at probe N as "N GPUs available". We also union in
 * whatever RunPod hints at via `availableGpuCounts` (often null but
 * occasionally populated for older GPUs). Result is a sorted, deduped list.
 */
export function mergeAvailableCounts(
    probes: Array<{
        gpuCount: number;
        stockStatus: StockStatus;
        availableGpuCounts: number[] | null;
    }>
): number[] {
    const counts = new Set<number>();
    for (const p of probes) {
        if (p.stockStatus !== "none") counts.add(p.gpuCount);
        if (Array.isArray(p.availableGpuCounts)) {
            for (const n of p.availableGpuCounts) {
                if (Number.isInteger(n) && n > 0 && n <= 64) counts.add(n);
            }
        }
    }
    return Array.from(counts).sort((a, b) => a - b);
}
