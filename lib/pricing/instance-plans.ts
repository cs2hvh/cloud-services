// Instance plan SEED — the original catalog used to populate the
// `instance_plans` DB table on first migration. After the migration
// applies, the DB is the source of truth and the dashboard reads
// plans via lib/pricing/plan-catalog.ts. Admins edit every field
// (vCPU, RAM, disk, price, name, active state, sort order) through
// the /admin/pricing/plans page.
//
// Two product tiers:
//
//   - Shared (`s-N`): burstable vCPUs that share host cores. Cheaper,
//     suitable for dev/staging/light production. Host oversubscribes
//     physical cores by `shared_oversubscription_ratio` (default 4).
//
//   - Dedicated (`d-N`): vCPUs pinned 1:1 to physical cores. No noisy
//     neighbors, predictable performance. Higher price, suitable for
//     production DBs, game servers, latency-sensitive workloads.
//
// To change a plan at runtime: edit it in the admin UI (NOT here).
// To add a new SEED plan that lands on every fresh install: append
// to DEFAULT_PLANS and add a matching row to the migration's INSERT.

export type InstanceTier = "shared" | "dedicated";

export type InstancePlan = {
    /** Stable identifier, used in API/DB ("s-3", "d-4", etc.). */
    slug: string;
    /** Customer-facing short name (often same as slug for now). */
    name: string;
    tier: InstanceTier;
    vcpu: number;
    memoryMB: number;
    diskGB: number;
    /** Default price — overridable per-plan via the `instance_plan_prices` table. Use getEffectivePrices() at runtime. */
    defaultHourlyUSD: number;
    defaultMonthlyUSD: number;
    /** Optional short marketing line shown under the spec list. */
    tagline?: string;
    /**
     * Region slug whitelist. Undefined/empty = available everywhere.
     * Non-empty = plan only offered in these regions.
     */
    allowedRegions?: string[];
    /**
     * Host id whitelist. Undefined/empty = available on every host
     * (subject to capacity). Non-empty = plan only offered on these
     * specific hosts.
     */
    allowedHostIds?: string[];
};

/** True if this plan is selectable in the given region. */
export function planAllowedInRegion(plan: InstancePlan, regionSlug: string): boolean {
    if (!plan.allowedRegions || plan.allowedRegions.length === 0) return true;
    return plan.allowedRegions.includes(regionSlug);
}

/** True if this plan is selectable on the given host. */
export function planAllowedOnHost(plan: InstancePlan, hostId: string): boolean {
    if (!plan.allowedHostIds || plan.allowedHostIds.length === 0) return true;
    return plan.allowedHostIds.includes(hostId);
}

// ─── Shared (burstable) ─────────────────────────────────────────
export const SHARED_PLANS: InstancePlan[] = [
    {
        slug: "s-1",
        name: "Shared 1×1",
        tier: "shared",
        vcpu: 1,
        memoryMB: 1024,
        diskGB: 15,
        defaultHourlyUSD: 0.007,
        defaultMonthlyUSD: 5,
        tagline: "Hobby site / dev box",
    },
    {
        slug: "s-2",
        name: "Shared 1×2",
        tier: "shared",
        vcpu: 1,
        memoryMB: 2048,
        diskGB: 30,
        defaultHourlyUSD: 0.014,
        defaultMonthlyUSD: 10,
        tagline: "Small API / staging",
    },
    {
        slug: "s-3",
        name: "Shared 2×4",
        tier: "shared",
        vcpu: 2,
        memoryMB: 4096,
        diskGB: 60,
        defaultHourlyUSD: 0.027,
        defaultMonthlyUSD: 20,
        tagline: "Production web app",
    },
    {
        slug: "s-4",
        name: "Shared 2×8",
        tier: "shared",
        vcpu: 2,
        memoryMB: 8192,
        diskGB: 120,
        defaultHourlyUSD: 0.054,
        defaultMonthlyUSD: 40,
        tagline: "Mid-tier API",
    },
    {
        slug: "s-5",
        name: "Shared 4×16",
        tier: "shared",
        vcpu: 4,
        memoryMB: 16384,
        diskGB: 200,
        defaultHourlyUSD: 0.107,
        defaultMonthlyUSD: 80,
        tagline: "Light dedicated workload",
    },
    {
        slug: "s-6",
        name: "Shared 6×24",
        tier: "shared",
        vcpu: 6,
        memoryMB: 24576,
        diskGB: 320,
        defaultHourlyUSD: 0.160,
        defaultMonthlyUSD: 120,
        tagline: "Larger shared workload",
    },
    {
        slug: "s-7",
        name: "Shared 8×32",
        tier: "shared",
        vcpu: 8,
        memoryMB: 32768,
        diskGB: 480,
        defaultHourlyUSD: 0.214,
        defaultMonthlyUSD: 160,
        tagline: "Top of shared range",
    },
];

// ─── Dedicated (1:1 pinned cores) ───────────────────────────────
export const DEDICATED_PLANS: InstancePlan[] = [
    {
        slug: "d-2",
        name: "Dedicated 2×8",
        tier: "dedicated",
        vcpu: 2,
        memoryMB: 8192,
        diskGB: 200,
        defaultHourlyUSD: 0.054,
        defaultMonthlyUSD: 40,
        tagline: "Entry dedicated, DB primary",
    },
    {
        slug: "d-4",
        name: "Dedicated 4×16",
        tier: "dedicated",
        vcpu: 4,
        memoryMB: 16384,
        diskGB: 400,
        defaultHourlyUSD: 0.107,
        defaultMonthlyUSD: 80,
        tagline: "Production DB / game server",
    },
    {
        slug: "d-8",
        name: "Dedicated 8×32",
        tier: "dedicated",
        vcpu: 8,
        memoryMB: 32768,
        diskGB: 800,
        defaultHourlyUSD: 0.214,
        defaultMonthlyUSD: 160,
        tagline: "High-traffic production",
    },
    {
        slug: "d-16",
        name: "Dedicated 16×64",
        tier: "dedicated",
        vcpu: 16,
        memoryMB: 65536,
        diskGB: 1600,
        defaultHourlyUSD: 0.428,
        defaultMonthlyUSD: 320,
        tagline: "Enterprise tier",
    },
    {
        slug: "d-32",
        name: "Dedicated 32×128",
        tier: "dedicated",
        vcpu: 32,
        memoryMB: 131072,
        diskGB: 3200,
        defaultHourlyUSD: 0.857,
        defaultMonthlyUSD: 640,
        tagline: "Heavy workload",
    },
];

/** Seed catalog used by the migration. Runtime reads should go through lib/pricing/plan-catalog.ts. */
export const DEFAULT_PLANS: InstancePlan[] = [...SHARED_PLANS, ...DEDICATED_PLANS];

/** Default ratio: 1 physical core hosts up to 4 shared vCPUs. Overridable per-host. */
export const DEFAULT_SHARED_OVERSUBSCRIPTION = 4;

// ─── Capacity math ──────────────────────────────────────────────

/**
 * Per-host fleet usage broken down by tier — used by the availability
 * check and by the admin host card.
 */
export type HostUsage = {
    dedicatedVcpuUsed: number;   // Σ vcpu of dedicated VMs on this host
    sharedVcpuUsed: number;      // Σ vcpu of shared VMs on this host
    memoryMBUsed: number;        // Σ memory_mb of every active VM
    diskGBUsed: number;          // Σ disk_gb of every active VM
};

/**
 * Compute what's left to allocate on a host, accounting for the
 * dedicated/shared split:
 *
 *   - Dedicated cores reserve physical cores 1:1.
 *   - Shared vCPUs run on whatever physical cores aren't reserved
 *     for dedicated, multiplied by the oversubscription ratio.
 *   - A new dedicated VM also "evicts" enough shared headroom that
 *     existing shared VMs still fit (ceil(shared_used / ratio)
 *     physical cores must remain available to them).
 */
export type HostAvailability = {
    dedicatedVcpu: number;
    sharedVcpu: number;
    memoryMB: number;
    diskGB: number;
};

export function computeHostAvailability(args: {
    totalCpuCores: number;
    totalMemoryMB: number;
    totalDiskGB: number;
    sharedRatio?: number;
    usage: HostUsage;
}): HostAvailability {
    const ratio = args.sharedRatio ?? DEFAULT_SHARED_OVERSUBSCRIPTION;
    const { dedicatedVcpuUsed, sharedVcpuUsed, memoryMBUsed, diskGBUsed } = args.usage;

    const physicalCoresReservedForShared = Math.ceil(sharedVcpuUsed / Math.max(1, ratio));
    const dedicatedVcpu = Math.max(
        0,
        args.totalCpuCores - dedicatedVcpuUsed - physicalCoresReservedForShared
    );

    const physicalCoresLeftForShared = Math.max(
        0,
        args.totalCpuCores - dedicatedVcpuUsed
    );
    const sharedCapacity = physicalCoresLeftForShared * ratio;
    const sharedVcpu = Math.max(0, sharedCapacity - sharedVcpuUsed);

    return {
        dedicatedVcpu,
        sharedVcpu,
        memoryMB: Math.max(0, args.totalMemoryMB - memoryMBUsed),
        diskGB: Math.max(0, args.totalDiskGB - diskGBUsed),
    };
}

/**
 * Can this plan be placed on a host with the given availability?
 *
 * Memory + disk checks are tier-agnostic; the CPU check picks the
 * right vCPU pool based on the plan's tier.
 */
export function canFitPlan(plan: InstancePlan, avail: HostAvailability): boolean {
    if (plan.memoryMB > avail.memoryMB) return false;
    if (plan.diskGB > avail.diskGB) return false;
    if (plan.tier === "dedicated") {
        return plan.vcpu <= avail.dedicatedVcpu;
    }
    return plan.vcpu <= avail.sharedVcpu;
}
