// Linode day-2 operations: power, resize, metrics, console, reset-password,
// rebuild, backups. Each existing compute route branches here when
// servers.provider === 'linode'; response shapes match the Proxmox paths so
// the dashboard components keep working unchanged.

import type { SupabaseClient } from "@supabase/supabase-js";

import { LinodeClient } from "@/lib/services/linode/client";
import type {
    LinodeBackupsResponse,
    LinodeError,
    LinodeInstance,
    LinodeInstanceStats,
    LinodeLishResponse,
} from "@/lib/services/linode/types";
import {
    findLinodePlan,
    getLinodeCatalog,
    isTypeAvailableInRegion,
    resolveLinodePlanPrice,
    type LinodeCatalog,
} from "@/lib/pricing/linode-catalog";
import { getLinodeInstance, pollLinodeInstance } from "./lifecycle";
import { formatPlanLabel } from "@/lib/pricing/plan-display";

export const LINODE_PLAN_SLUG_PREFIX = "linode:";

export interface LinodeServerRow {
    id: number;
    linode_id: number | null;
    location: string | null; // Linode region id
    plan_slug: string | null; // 'linode:<type_id>'
    memory_mb?: number | null;
    disk_gb?: number | null;
    status?: string | null;
    details?: Record<string, unknown> | null;
}

function requireLinodeId(server: LinodeServerRow): number {
    if (!server.linode_id) {
        throw new Error("Server is missing its Linode instance id");
    }
    return server.linode_id;
}

export function linodeTypeIdFromSlug(planSlug: string | null): string | null {
    if (!planSlug || !planSlug.startsWith(LINODE_PLAN_SLUG_PREFIX)) return null;
    return planSlug.slice(LINODE_PLAN_SLUG_PREFIX.length);
}

/** Whether backups are enabled per the row's details.linode block. */
function backupsEnabledFor(server: LinodeServerRow): boolean {
    const linode = server.details?.linode as { backups_enabled?: unknown } | undefined;
    return linode?.backups_enabled === true;
}

// ─── Power ───────────────────────────────────────────────────────────────────

export async function linodePower(
    server: LinodeServerRow,
    action: "start" | "stop" | "reboot"
): Promise<{ status: string }> {
    const linodeId = requireLinodeId(server);
    const path =
        action === "start"
            ? `/linode/instances/${linodeId}/boot`
            : action === "stop"
                ? `/linode/instances/${linodeId}/shutdown`
                : `/linode/instances/${linodeId}/reboot`;
    await LinodeClient.post(path, {});
    // Optimistic final status — realtime sync corrects if the action stalls.
    return { status: action === "stop" ? "stopped" : "running" };
}

// ─── Resize ──────────────────────────────────────────────────────────────────

export interface LinodeResizeWirePlan {
    slug: string;
    name: string;
    tier: "shared" | "dedicated";
    vcpu: number;
    memoryMB: number;
    diskGB: number;
    hourlyUSD: number;
    monthlyUSD: number;
    isCurrent: boolean;
    fits: boolean;
    reason?: string;
}

function tierForClass(cls: string): "shared" | "dedicated" {
    return cls === "nanode" || cls === "standard" ? "shared" : "dedicated";
}

/**
 * Resize targets — same wire shape as the Proxmox GET so the resize section
 * renders unchanged: every visible plan annotated with fits/reason, prices
 * region-resolved (what the customer would be billed after the resize).
 */
export async function getLinodeResizeOptions(
    server: LinodeServerRow,
    supabase: SupabaseClient
): Promise<{
    current: { planSlug: string | null; vcpu: number; memoryMB: number; diskGB: number; tier: string };
    plans: LinodeResizeWirePlan[];
}> {
    const catalog = await getLinodeCatalog(supabase);
    const region = server.location ?? "";
    const currentTypeId = linodeTypeIdFromSlug(server.plan_slug);
    const currentPlan = currentTypeId ? findLinodePlan(catalog, currentTypeId) : null;
    const currentDiskGB = Number(server.disk_gb || currentPlan?.diskGB || 0);

    // Linode-parity generation dedupe: sizes repeat across g6/g7/g8 type ids.
    // Hide a generation that simply isn't offered in this region when an
    // equivalent-size plan IS available — "out of stock" is reserved for
    // sizes with no purchasable generation (and the current plan always shows).
    const availableSizes = new Set(
        catalog.plans
            .filter((p) => !region || isTypeAvailableInRegion(catalog, p.id, region))
            .map((p) => `${p.class}:${p.vcpus}:${p.memoryMB}`)
    );
    const visiblePlans = catalog.plans.filter((p) => {
        if (p.id === currentTypeId) return true;
        if (!region || isTypeAvailableInRegion(catalog, p.id, region)) return true;
        return !availableSizes.has(`${p.class}:${p.vcpus}:${p.memoryMB}`);
    });

    const plans: LinodeResizeWirePlan[] = visiblePlans
        .map((p) => {
            const price = resolveLinodePlanPrice(p, region);
            const isCurrent = p.id === currentTypeId;
            let fits = true;
            let reason: string | undefined;
            if (isCurrent) {
                fits = false;
                reason = "Current plan";
            } else if (p.diskGB < currentDiskGB) {
                // Linode auto disk resize can't shrink below allocated disk.
                fits = false;
                reason = "Smaller disk than current plan";
            } else if (region && !isTypeAvailableInRegion(catalog, p.id, region)) {
                fits = false;
                reason = "Out of stock in this region";
            }
            return {
                slug: `${LINODE_PLAN_SLUG_PREFIX}${p.id}`,
                name: formatPlanLabel(p.label),
                tier: tierForClass(p.class),
                vcpu: p.vcpus,
                memoryMB: p.memoryMB,
                diskGB: p.diskGB,
                hourlyUSD: price.hourlyUSD,
                monthlyUSD: price.monthlyUSD,
                isCurrent,
                fits,
                reason,
            };
        })
        .sort((a, b) => a.vcpu - b.vcpu || a.memoryMB - b.memoryMB);

    return {
        current: {
            planSlug: server.plan_slug ?? null,
            vcpu: Number(currentPlan?.vcpus ?? 0),
            memoryMB: Number(server.memory_mb ?? currentPlan?.memoryMB ?? 0),
            diskGB: currentDiskGB,
            tier: currentPlan ? tierForClass(currentPlan.class) : "shared",
        },
        plans,
    };
}

export interface LinodeResizeStart {
    targetTypeId: string;
    /** Frozen customer rate after the resize (plan + backups add-on). */
    newHourlyRate: number;
    newMonthlyRate: number;
    plan: { label: string; vcpus: number; memoryMB: number; diskGB: number; class: string };
}

/** Validate a resize request and kick it off upstream (async migration). */
export async function startLinodeResize(
    server: LinodeServerRow,
    rawTarget: string,
    supabase: SupabaseClient
): Promise<LinodeResizeStart> {
    const linodeId = requireLinodeId(server);
    const targetTypeId = rawTarget.startsWith(LINODE_PLAN_SLUG_PREFIX)
        ? rawTarget.slice(LINODE_PLAN_SLUG_PREFIX.length)
        : rawTarget;

    const catalog = await getLinodeCatalog(supabase);
    const plan = findLinodePlan(catalog, targetTypeId);
    if (!plan) throw Object.assign(new Error(`Unknown plan: ${targetTypeId}`), { statusCode: 400 });

    const currentTypeId = linodeTypeIdFromSlug(server.plan_slug);
    if (currentTypeId === targetTypeId) {
        throw Object.assign(new Error("The server is already on this plan."), { statusCode: 400 });
    }
    const currentDiskGB = Number(server.disk_gb || 0);
    if (plan.diskGB < currentDiskGB) {
        throw Object.assign(
            new Error("Cannot resize to a plan with a smaller disk."),
            { statusCode: 400 }
        );
    }
    const region = server.location ?? "";
    if (region && !isTypeAvailableInRegion(catalog, targetTypeId, region)) {
        throw Object.assign(
            new Error(`${plan.label} is out of stock in this region.`),
            { statusCode: 409 }
        );
    }

    const price = resolveLinodePlanPrice(plan, region);
    const backupsHourly = backupsEnabledFor(server) ? price.backupsHourlyUSD ?? 0 : 0;
    const newHourlyRate = Number((price.hourlyUSD + backupsHourly).toFixed(5));

    await LinodeClient.post(`/linode/instances/${linodeId}/resize`, {
        type: targetTypeId,
        allow_auto_disk_resize: true,
    });

    return {
        targetTypeId,
        newHourlyRate,
        newMonthlyRate: Number((newHourlyRate * 720).toFixed(2)),
        plan: {
            label: plan.label,
            vcpus: plan.vcpus,
            memoryMB: plan.memoryMB,
            diskGB: plan.diskGB,
            class: plan.class,
        },
    };
}

/** Wait for a resize migration to settle (running or offline). ~20 min budget. */
export async function waitForLinodeResize(linodeId: number) {
    return pollLinodeInstance(linodeId, {
        until: new Set(["running", "offline"]),
        timeoutMs: 20 * 60_000,
        fastIntervalMs: 10_000,
        fastWindowMs: 2 * 60_000,
        slowIntervalMs: 15_000,
    });
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

interface VmMetricsWire {
    ok: true;
    metrics: {
        cpu: number;
        mem_used: number;
        mem_total: number;
        mem_pct: number;
        disk_read: number;
        disk_write: number;
        net_in: number;
        net_out: number;
        uptime: number;
        status: string;
        timestamp: string;
    };
    history: Array<{
        time: number;
        cpu: number;
        mem_pct: number;
        net_in: number;
        net_out: number;
        disk_read: number;
        disk_write: number;
    }>;
}

function lastValue(series: Array<[number, number]> | undefined): number {
    if (!series || series.length === 0) return 0;
    const v = series[series.length - 1]?.[1];
    return Number.isFinite(v) ? v : 0;
}

function clampPct(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
}

function linodeStatusToVmStatus(status: string): string {
    if (status === "offline" || status === "stopped") return "stopped";
    if (status === "running") return "running";
    return status;
}

/**
 * Adapt Linode's 24 h stats (5-minute granularity, bits/s network, no memory
 * metric) to the exact Proxmox-shaped response the monitoring tab renders.
 * Memory is not observable through the Linode API → reported as 0/unknown.
 */
export async function getLinodeMetricsResponse(
    server: LinodeServerRow
): Promise<VmMetricsWire> {
    const linodeId = requireLinodeId(server);

    // Redis-cache the upstream fetch: Linode stats move every ~5 min while the
    // dashboard polls every 15 s — no reason to hammer the API (or its 429s).
    const cacheKey = `linode:metrics:${linodeId}`;
    try {
        const { redis } = await import("@/lib/redis");
        const cached = await redis.get(cacheKey);
        if (cached) return (typeof cached === "string" ? JSON.parse(cached) : cached) as VmMetricsWire;
    } catch {
        /* cache is best-effort */
    }

    const [instance, stats] = await Promise.all([
        getLinodeInstance(linodeId),
        LinodeClient.get<LinodeInstanceStats>(`/linode/instances/${linodeId}/stats`).catch((e) => {
            // Stats are optional decoration — never fail the whole metrics
            // response over them. Linode 400s while an instance is fresh,
            // offline, or has collected no samples yet, and that particular
            // reason ("Stats are unavailable at this time.") trips the client's
            // capacity heuristic on the word "unavailable", so it arrives here
            // tagged CAPACITY rather than INVALID. Degrade on everything except
            // a dead token, which the instance fetch above surfaces anyway.
            const le = e as LinodeError;
            if (le.code === "AUTH") throw le;
            return null;
        }),
    ]);

    const memTotalBytes = Number(server.memory_mb || instance.specs?.memory || 0) * 1024 * 1024;
    const cpuSeries = stats?.data?.cpu ?? [];
    const netInSeries = stats?.data?.netv4?.in ?? [];
    const netOutSeries = stats?.data?.netv4?.out ?? [];
    const ioSeries = stats?.data?.io?.io ?? [];

    const response: VmMetricsWire = {
        ok: true,
        metrics: {
            cpu: clampPct(lastValue(cpuSeries)),
            mem_used: 0, // not exposed by the Linode API
            mem_total: memTotalBytes,
            mem_pct: 0,
            disk_read: Math.round(lastValue(ioSeries)),
            disk_write: 0, // Linode reports combined IO only
            net_in: Math.round(lastValue(netInSeries) / 8), // bits/s → bytes/s
            net_out: Math.round(lastValue(netOutSeries) / 8),
            uptime: 0, // not exposed by the Linode API
            status: linodeStatusToVmStatus(instance.status),
            timestamp: new Date().toISOString(),
        },
        history: (() => {
            const window = cpuSeries.slice(-70);
            // Series share timestamps; align each by distance from its tail.
            const at = (arr: Array<[number, number]>, idx: number): number => {
                const offset = arr.length - window.length + idx;
                const v = offset >= 0 ? arr[offset]?.[1] : 0;
                return Number.isFinite(v) ? v : 0;
            };
            return window.map(([ts, cpu], idx) => ({
                time: Math.floor(ts / 1000), // ms → s (Proxmox RRD convention)
                cpu: clampPct(cpu),
                mem_pct: 0,
                net_in: Math.round(at(netInSeries, idx) / 8),
                net_out: Math.round(at(netOutSeries, idx) / 8),
                disk_read: Math.round(at(ioSeries, idx)),
                disk_write: 0,
            }));
        })(),
    };

    try {
        const { redis } = await import("@/lib/redis");
        await redis.set(cacheKey, JSON.stringify(response), { ex: 60 });
    } catch {
        /* cache is best-effort */
    }

    return response;
}

// ─── Console (Lish) ──────────────────────────────────────────────────────────

export async function getLinodeConsole(server: LinodeServerRow): Promise<{
    kind: "lish";
    weblishUrl: string | null;
    glishUrl: string | null;
}> {
    const linodeId = requireLinodeId(server);
    const lish = await LinodeClient.post<LinodeLishResponse>(
        `/linode/instances/${linodeId}/lish`,
        {}
    );
    return {
        kind: "lish",
        weblishUrl: (lish.weblish_url as string | undefined) ?? null,
        glishUrl: (lish.glish_url as string | undefined) ?? null,
    };
}

// ─── Reset password (requires offline) ───────────────────────────────────────

/**
 * Orchestrated root-password reset: shutdown → wait offline → set password →
 * boot → wait running. Long-running (minutes) — call from after() with the
 * row's details.provisioning stages driving the realtime UI.
 */
export async function performLinodeResetPassword(
    server: LinodeServerRow,
    rootPass: string,
    onStage?: (stage: string, progress: number, message: string) => Promise<void> | void
): Promise<void> {
    const linodeId = requireLinodeId(server);

    const current = await getLinodeInstance(linodeId);
    if (current.status !== "offline") {
        await onStage?.("stopping", 20, "Shutting down for password reset...");
        await LinodeClient.post(`/linode/instances/${linodeId}/shutdown`, {});
        const down = await pollLinodeInstance(linodeId, {
            until: new Set(["offline"]),
            timeoutMs: 5 * 60_000,
        });
        if (!down.ok) throw new Error("Server did not shut down in time. Please try again.");
    }

    await onStage?.("resetting", 55, "Setting the new root password...");
    await LinodeClient.post(`/linode/instances/${linodeId}/password`, { root_pass: rootPass });

    await onStage?.("booting", 80, "Booting your server...");
    await LinodeClient.post(`/linode/instances/${linodeId}/boot`, {});
    const up = await pollLinodeInstance(linodeId, {
        until: new Set(["running"]),
        timeoutMs: 5 * 60_000,
    });
    if (!up.ok) throw new Error("Password was set but the server did not boot in time.");
}

// ─── Rebuild ─────────────────────────────────────────────────────────────────

export async function startLinodeRebuild(
    server: LinodeServerRow,
    opts: { imageId: string; rootPass: string; authorizedKeys?: string[] },
    catalog: LinodeCatalog
): Promise<{ imageLabel: string }> {
    const linodeId = requireLinodeId(server);
    const image = catalog.images.find((i) => i.id === opts.imageId);
    if (!image) {
        throw Object.assign(new Error(`Unknown image: ${opts.imageId}`), { statusCode: 400 });
    }
    await LinodeClient.post<LinodeInstance>(`/linode/instances/${linodeId}/rebuild`, {
        image: opts.imageId,
        root_pass: opts.rootPass,
        ...(opts.authorizedKeys && opts.authorizedKeys.length > 0
            ? { authorized_keys: opts.authorizedKeys }
            : {}),
    });
    return { imageLabel: image.label };
}

/**
 * A restore runs `running → restoring → offline` — Linode does NOT boot the
 * instance back up afterwards. The instance also keeps its pre-restore status
 * for a few seconds before flipping, so wait for it to *enter* `restoring`
 * first; polling straight for a terminal status would resolve instantly
 * against the stale one and report the restore finished before it began.
 * Missing the transient window is harmless — the second poll still governs.
 */
export async function waitForLinodeRestore(linodeId: number) {
    await pollLinodeInstance(linodeId, {
        until: new Set(["restoring"]),
        timeoutMs: 2 * 60_000,
        fastIntervalMs: 5_000,
        fastWindowMs: 60_000,
        slowIntervalMs: 10_000,
    });
    return pollLinodeInstance(linodeId, {
        until: new Set(["offline", "running"]),
        timeoutMs: 30 * 60_000,
        fastIntervalMs: 10_000,
        fastWindowMs: 2 * 60_000,
        slowIntervalMs: 15_000,
    });
}

export async function waitForLinodeRebuild(linodeId: number) {
    return pollLinodeInstance(linodeId, {
        until: new Set(["running"]),
        timeoutMs: 15 * 60_000,
        fastIntervalMs: 5_000,
        fastWindowMs: 60_000,
        slowIntervalMs: 10_000,
    });
}

// ─── Rename ──────────────────────────────────────────────────────────────────

/** Push a rename upstream (best-effort — the DB row is the display truth). */
export async function renameLinodeInstance(server: LinodeServerRow, label: string): Promise<void> {
    const linodeId = requireLinodeId(server);
    await LinodeClient.put(`/linode/instances/${linodeId}`, { label });
}

// ─── Backups ─────────────────────────────────────────────────────────────────

export async function listLinodeBackups(server: LinodeServerRow): Promise<LinodeBackupsResponse> {
    const linodeId = requireLinodeId(server);
    return LinodeClient.get<LinodeBackupsResponse>(`/linode/instances/${linodeId}/backups`);
}

export async function enableLinodeBackups(server: LinodeServerRow): Promise<void> {
    const linodeId = requireLinodeId(server);
    await LinodeClient.post(`/linode/instances/${linodeId}/backups/enable`, {});
}

export async function cancelLinodeBackups(server: LinodeServerRow): Promise<void> {
    const linodeId = requireLinodeId(server);
    await LinodeClient.post(`/linode/instances/${linodeId}/backups/cancel`, {});
}

export async function takeLinodeSnapshot(
    server: LinodeServerRow,
    label: string
): Promise<void> {
    const linodeId = requireLinodeId(server);
    await LinodeClient.post(`/linode/instances/${linodeId}/backups`, { label });
}

export async function restoreLinodeBackup(
    server: LinodeServerRow,
    backupId: number,
    overwrite: boolean
): Promise<void> {
    const linodeId = requireLinodeId(server);
    await LinodeClient.post(`/linode/instances/${linodeId}/backups/${backupId}/restore`, {
        linode_id: linodeId,
        overwrite,
    });
}
