// RunPod ID mapping, pricing math, and GraphQL query builders.

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
 * GraphQL gpuTypes query for stock + price.
 * We issue one query per cloudType per worker tick; results are joined to
 * gpu_catalog in the inventory operation.
 */
export function buildGpuTypesQuery(
    gpuCount: number,
    secureCloud: boolean
): {
    query: string;
    variables: Record<string, unknown>;
} {
    return {
        query: `
            query GpuTypes($gpuCount: Int!, $secureCloud: Boolean!) {
                gpuTypes {
                    id
                    displayName
                    memoryInGb
                    secureCloud
                    communityCloud
                    lowestPrice(input: { gpuCount: $gpuCount, secureCloud: $secureCloud }) {
                        stockStatus
                        availableGpuCounts
                        uninterruptablePrice
                        minimumBidPrice
                    }
                }
            }
        `,
        variables: { gpuCount, secureCloud },
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
 * Normalize the availableGpuCounts array from RunPod, accounting for the
 * common case where the field is null/empty but stock_status indicates
 * inventory is present. In that case we default to [1] so the UI can at least
 * offer a single-GPU pod.
 */
export function normalizeAvailableCounts(
    raw: number[] | null | undefined,
    stockStatus: ReturnType<typeof normalizeStockStatus>
): number[] {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.filter((n) => Number.isInteger(n) && n > 0 && n <= 64);
    }
    return stockStatus === "none" ? [] : [1];
}
