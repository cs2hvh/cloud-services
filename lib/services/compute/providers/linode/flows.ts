// Shared Linode day-2 orchestration flows — resize, rebuild, and backup
// actions including their billing re-rates. Extracted from the dashboard
// routes (app/api/services/compute/vms/[id]/…) so the public v1 API
// (app/api/v1/compute/…) reuses the exact same semantics. Both route families
// stay thin wrappers that differ only in auth + response envelope.
//
// Flow functions never build HTTP responses: failures come back as
// { ok: false, status, message } so each caller renders its own envelope.

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createWorkerClient } from "@/lib/supabase/server";
import { BillingCredits } from "@/lib/billing/credits";
import {
    findLinodePlan,
    getLinodeCatalog,
    resolveLinodePlanPrice,
} from "@/lib/pricing/linode-catalog";
import type { LinodeBackupsResponse, LinodeError } from "@/lib/services/linode/types";
import { sendServiceEventEmail } from "@/lib/services/shared/service-event-email";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";
import { AuditLogService } from "@/lib/audit";
import { validateRootPassword } from "./create";
import { sanitizeProviderMessage } from "./errors";
import {
    cancelLinodeBackups,
    enableLinodeBackups,
    getLinodeResizeOptions,
    linodeTypeIdFromSlug,
    listLinodeBackups,
    restoreLinodeBackup,
    startLinodeRebuild,
    startLinodeResize,
    takeLinodeSnapshot,
    waitForLinodeRebuild,
    waitForLinodeResize,
    waitForLinodeRestore,
} from "./ops";

/** Non-HTTP failure shape — callers translate into their own envelope. */
export type LinodeFlowFailure = { ok: false; status: number; message: string };

/** Map an upstream LinodeError into a flow failure (same as the old routes). */
export function mapLinodeFlowError(e: unknown, fallback: string): LinodeFlowFailure {
    const le = e as LinodeError;
    if (le?.code === "INVALID" && le.message) {
        return { ok: false, status: 400, message: sanitizeProviderMessage(le.message, fallback) };
    }
    console.error("[Linode Flow]", fallback, le?.message ?? e);
    return { ok: false, status: 502, message: fallback };
}

/** Resolve a user's SSH public keys by id (owner-scoped, all-or-nothing). */
export async function resolveUserSshKeys(
    supabase: SupabaseClient,
    userId: string,
    sshKeyIds: string[]
): Promise<{ ok: true; keys: string[] } | LinodeFlowFailure> {
    if (sshKeyIds.length === 0) return { ok: true, keys: [] };
    const { data: keys, error: keysError } = await supabase
        .from("user_ssh_keys")
        .select("id, public_key")
        .eq("user_id", userId)
        .in("id", sshKeyIds);
    if (keysError || (keys?.length ?? 0) !== sshKeyIds.length) {
        return { ok: false, status: 400, message: "One or more selected SSH keys no longer exist." };
    }
    return { ok: true, keys: (keys ?? []).map((k) => String(k.public_key).trim()) };
}

// ─── Resize ──────────────────────────────────────────────────────────────────

export interface LinodeResizeFlowServer {
    id: number;
    status: string | null;
    linode_id: number | null;
    location: string | null;
    plan_slug: string | null;
    memory_mb: number | null;
    disk_gb: number | null;
    details: Record<string, unknown> | null;
    billing_service_id: string | null;
}

/**
 * Linode resize: validate against the synced catalog, kick off the upstream
 * migration, then (in the background) wait for it to settle, update the stored
 * specs, and re-rate the billing meter to the new frozen customer price.
 *
 * Linode powers the instance off, migrates, and boots it back if it was
 * running — so both running and stopped servers may start a resize.
 */
export async function startLinodeResizeFlow({
    supabase,
    server,
    userId,
    planSlug,
}: {
    supabase: SupabaseClient;
    server: LinodeResizeFlowServer;
    userId: string;
    planSlug: string;
}): Promise<{ ok: true } | LinodeFlowFailure> {
    const serverId = server.id;
    const status = String(server.status);
    if (status !== "running" && status !== "stopped") {
        return { ok: false, status: 409, message: "Server must be running or stopped to resize." };
    }
    if (!server.linode_id) {
        return { ok: false, status: 422, message: "Server configuration is incomplete." };
    }

    const row = {
        id: serverId,
        linode_id: server.linode_id,
        location: server.location,
        plan_slug: server.plan_slug,
        memory_mb: server.memory_mb,
        disk_gb: server.disk_gb,
        details: server.details,
    };

    let resize;
    try {
        // Funds gate happens before the upstream call: probe the target rate first.
        const preview = await getLinodeResizeOptions(row, supabase);
        const target = preview.plans.find(
            (p) => p.slug === planSlug || p.slug === `linode:${planSlug}`
        );
        if (!target) {
            return { ok: false, status: 400, message: "That plan is no longer available." };
        }
        if (!target.fits) {
            return {
                ok: false,
                status: 409,
                message: target.reason ?? "This plan is unavailable for your server.",
            };
        }
        const hasFunds = await BillingCredits.hasSufficientBalance(userId, target.hourlyUSD);
        if (!hasFunds) {
            return {
                ok: false,
                status: 402,
                message: `Insufficient balance. You need at least $${target.hourlyUSD.toFixed(2)} to resize.`,
            };
        }

        resize = await startLinodeResize(row, planSlug, supabase);
    } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string; message: string };
        const statusCode = err.statusCode ?? (err.code === "CAPACITY" ? 409 : 502);
        const message =
            err.statusCode || err.code === "CAPACITY" || err.code === "INVALID"
                ? err.message
                : "Unable to start the resize. Please try again.";
        console.error("[VM Resize] Linode start failed:", err.message);
        return { ok: false, status: statusCode, message };
    }

    const priorStatus = status;
    const startedAt = new Date().toISOString();
    const linodeDetails = (row.details?.linode as Record<string, unknown> | undefined) ?? {};
    const billingServiceId = server.billing_service_id ?? null;
    const linodeId = server.linode_id;

    await supabase
        .from("servers")
        .update({
            status: "provisioning",
            details: {
                linode: linodeDetails,
                provisioning: {
                    stage: "resizing",
                    progress: 10,
                    message: `Resizing to ${resize.plan.label}…`,
                    started_at: startedAt,
                },
            },
        })
        .eq("id", serverId);

    after(async () => {
        const svc = await createWorkerClient();
        try {
            const poll = await waitForLinodeResize(linodeId);
            if (!poll.ok || !poll.instance) {
                throw new Error(poll.timedOut ? "Resize timed out upstream." : "Resize failed upstream.");
            }

            const finalStatus = poll.instance.status === "offline" ? "stopped" : "running";
            await svc
                .from("servers")
                .update({
                    status: finalStatus,
                    cpu_cores: resize.plan.vcpus,
                    memory_mb: resize.plan.memoryMB,
                    disk_gb: resize.plan.diskGB,
                    plan_slug: `linode:${resize.targetTypeId}`,
                    hourly_cost: resize.newHourlyRate,
                    monthly_cost: resize.newMonthlyRate,
                    tier:
                        resize.plan.class === "nanode" || resize.plan.class === "standard"
                            ? "shared"
                            : "dedicated",
                    details: {
                        linode: { ...linodeDetails, type: resize.targetTypeId, class: resize.plan.class },
                        provisioning: {
                            stage: "complete",
                            progress: 100,
                            message: `Resized to ${resize.plan.label}`,
                            started_at: startedAt,
                            completed_at: new Date().toISOString(),
                        },
                    },
                })
                .eq("id", serverId);

            if (billingServiceId) {
                await BillingCredits.rerateActiveCompute({
                    serviceId: billingServiceId,
                    hourlyRate: resize.newHourlyRate,
                }).catch((e) => console.error("[VM Resize] re-rate failed:", e));
            }
        } catch (err) {
            console.error("[VM Resize] Linode resize failed:", err instanceof Error ? err.message : err);
            try {
                await svc
                    .from("servers")
                    .update({
                        status: priorStatus,
                        details: {
                            linode: linodeDetails,
                            provisioning: {
                                stage: "failed",
                                progress: 100,
                                message: "Resize failed. Your server was left unchanged.",
                                failed_at: new Date().toISOString(),
                            },
                        },
                    })
                    .eq("id", serverId);
            } catch {
                /* best-effort rollback */
            }
        }
    });

    return { ok: true };
}

// ─── Rebuild ─────────────────────────────────────────────────────────────────

export interface LinodeRebuildFlowServer {
    id: number;
    name: string | null;
    status: string | null;
    provider: string | null;
    linode_id: number | null;
    location: string | null;
    details: Record<string, unknown> | null;
}

/**
 * Rebuild a Linode-backed server with a fresh image: wipes all disks, deploys
 * the chosen image with a new root password (+ optional SSH keys), and boots.
 * Linode-only — Proxmox servers use custom-image reprovisioning instead.
 */
export async function startLinodeRebuildFlow({
    supabase,
    server,
    user,
    imageId,
    rootPass,
    sshKeyIds,
    userAgent,
}: {
    supabase: SupabaseClient;
    server: LinodeRebuildFlowServer;
    user: { id: string; email?: string | null };
    imageId: string;
    rootPass: string;
    sshKeyIds: string[];
    userAgent?: string | null;
}): Promise<{ ok: true } | LinodeFlowFailure> {
    const serverId = server.id;

    if (!imageId) return { ok: false, status: 400, message: "image is required" };
    const passError = validateRootPassword(rootPass);
    if (passError) return { ok: false, status: 400, message: passError };

    if (server.provider !== "linode") {
        return { ok: false, status: 400, message: "Rebuild is not available for this server." };
    }
    if (!server.linode_id) {
        return { ok: false, status: 422, message: "Server is still provisioning" };
    }
    const status = String(server.status);
    if (status !== "running" && status !== "stopped") {
        return { ok: false, status: 409, message: "Server must be running or stopped to rebuild." };
    }

    // Resolve SSH keys (owner-scoped).
    const resolved = await resolveUserSshKeys(supabase, user.id, sshKeyIds.slice(0, 25));
    if (!resolved.ok) return resolved;
    const authorizedKeys = resolved.keys;

    const row = {
        id: serverId,
        linode_id: server.linode_id,
        location: server.location,
        plan_slug: null,
    };
    const linodeDetails = (server.details?.linode as Record<string, unknown> | undefined) ?? {};
    const startedAt = new Date().toISOString();
    const linodeId = server.linode_id;

    let imageLabel: string;
    try {
        const catalog = await getLinodeCatalog(supabase);
        const started = await startLinodeRebuild(row, { imageId, rootPass, authorizedKeys }, catalog);
        imageLabel = started.imageLabel;
    } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        const statusCode = err.statusCode ?? 502;
        const message =
            err.statusCode || err.code === "INVALID"
                ? err.message
                : "Unable to start the rebuild. Please try again.";
        console.error("[VM Rebuild] start failed:", err.message);
        return { ok: false, status: statusCode, message };
    }

    await supabase
        .from("servers")
        .update({
            status: "provisioning",
            details: {
                linode: { ...linodeDetails, image: imageId, image_label: imageLabel },
                provisioning: {
                    stage: "rebuilding",
                    progress: 15,
                    message: `Rebuilding with ${imageLabel}…`,
                    started_at: startedAt,
                },
            },
        })
        .eq("id", serverId);

    // Audit destructive user op (best-effort).
    AuditLogService.create({
        user_id: user.id,
        user_email: user.email ?? undefined,
        user_role: "user",
        action: "update",
        service_type: "compute",
        service_id: String(serverId),
        service_name: String(server.name ?? ""),
        metadata: { operation: "rebuild", image: imageId },
        user_agent: userAgent || undefined,
    }).catch(() => {});

    after(async () => {
        const svc = await createWorkerClient();
        try {
            const poll = await waitForLinodeRebuild(linodeId);
            if (!poll.ok) {
                throw new Error(poll.timedOut ? "Rebuild timed out upstream." : "Rebuild failed upstream.");
            }
            await svc
                .from("servers")
                .update({
                    status: "running",
                    os: imageLabel,
                    details: {
                        linode: { ...linodeDetails, image: imageId, image_label: imageLabel },
                        provisioning: {
                            stage: "complete",
                            progress: 100,
                            message: "Rebuild complete",
                            started_at: startedAt,
                            completed_at: new Date().toISOString(),
                        },
                    },
                })
                .eq("id", serverId);

            await sendServiceEventEmail({
                userEmail: user.email,
                serviceType: "Virtual Server",
                serviceName: String(server.name ?? `Server #${serverId}`),
                event: "updated",
                summary: `Your server was rebuilt with ${imageLabel}.`,
                actionPath: `/dashboard/services/compute/vps/${serverId}`,
            });
            try {
                await NotificationService.create(
                    createServiceNotification({
                        userId: user.id,
                        serviceType: "compute",
                        action: "updated",
                        serviceName: String(server.name ?? `Server #${serverId}`),
                        serviceId: String(serverId),
                        metadata: { operation: "rebuild", image: imageLabel },
                    })
                );
            } catch {}
        } catch (err) {
            const failureMessage = err instanceof Error ? err.message : String(err);
            console.error("[VM Rebuild] failed:", failureMessage);
            try {
                await svc
                    .from("servers")
                    .update({
                        status: "failed",
                        details: {
                            linode: linodeDetails,
                            provisioning: {
                                stage: "failed",
                                progress: 0,
                                message: failureMessage,
                                started_at: startedAt,
                                failed_at: new Date().toISOString(),
                            },
                        },
                    })
                    .eq("id", serverId);
            } catch {}
            await sendServiceEventEmail({
                userEmail: user.email,
                serviceType: "Virtual Server",
                serviceName: String(server.name ?? `Server #${serverId}`),
                event: "failed",
                errorMessage: failureMessage,
                actionPath: `/dashboard/services/compute/vps/${serverId}`,
            });
        }
    });

    return { ok: true };
}

// ─── Backups ─────────────────────────────────────────────────────────────────

export interface LinodeBackupsFlowServer {
    id: number;
    name: string | null;
    linode_id: number | null;
    location: string | null;
    plan_slug: string | null;
    details: Record<string, unknown> | null;
    billing_service_id: string | null;
}

export interface LinodeBackupsOverview {
    enabled: boolean;
    backups: LinodeBackupsResponse;
    pricing: { hourlyUSD: number | null; monthlyUSD: number | null };
}

/**
 * Backups tab payload: current state, backup list (when enabled), and the
 * add-on price quote so an enable card/client can show what it costs.
 * Throws LinodeError — map with mapLinodeFlowError.
 */
export async function getLinodeBackupsOverview(
    supabase: SupabaseClient,
    server: LinodeBackupsFlowServer
): Promise<LinodeBackupsOverview> {
    const linode = (server.details?.linode ?? {}) as { backups_enabled?: unknown };
    const enabled = linode.backups_enabled === true;

    const backups = enabled
        ? await listLinodeBackups({
              id: server.id,
              linode_id: server.linode_id,
              location: server.location,
              plan_slug: server.plan_slug,
          })
        : { automatic: [], snapshot: { current: null, in_progress: null } };

    // Quote the add-on price so the enable card can show it.
    const catalog = await getLinodeCatalog(supabase);
    const typeId = linodeTypeIdFromSlug(server.plan_slug);
    const plan = typeId ? findLinodePlan(catalog, typeId) : null;
    const price = plan ? resolveLinodePlanPrice(plan, server.location ?? "") : null;

    return {
        enabled,
        backups,
        pricing: {
            hourlyUSD: price?.backupsHourlyUSD ?? null,
            monthlyUSD: price?.backupsMonthlyUSD ?? null,
        },
    };
}

export type LinodeBackupsActionResult =
    | { ok: true; status: number; data: Record<string, unknown> }
    | LinodeFlowFailure;

/**
 * Execute a backups action (enable | cancel | snapshot | restore).
 *
 * Enabling/cancelling re-freezes the billing meter (plan rate ± backups
 * add-on at today's catalog price), mirroring the resize re-rate semantics.
 */
export async function runLinodeBackupsAction({
    supabase,
    server,
    user,
    action,
    label,
    backupId: rawBackupId,
    overwrite,
    userAgent,
}: {
    supabase: SupabaseClient;
    server: LinodeBackupsFlowServer;
    user: { id: string; email?: string | null };
    action: "enable" | "cancel" | "snapshot" | "restore";
    label?: string;
    backupId?: number;
    overwrite?: boolean;
    userAgent?: string | null;
}): Promise<LinodeBackupsActionResult> {
    const serverId = server.id;
    const row = {
        id: server.id,
        linode_id: server.linode_id,
        location: server.location,
        plan_slug: server.plan_slug,
    };
    const linodeDetails = (server.details?.linode ?? {}) as Record<string, unknown>;

    /** Re-freeze the meter to plan ± backups add-on at today's catalog price. */
    const rerate = async (backupsEnabled: boolean): Promise<number | null> => {
        const catalog = await getLinodeCatalog(supabase);
        const typeId = linodeTypeIdFromSlug(server.plan_slug);
        const plan = typeId ? findLinodePlan(catalog, typeId) : null;
        if (!plan) return null;
        const price = resolveLinodePlanPrice(plan, server.location ?? "");
        const newHourly = Number(
            (price.hourlyUSD + (backupsEnabled ? price.backupsHourlyUSD ?? 0 : 0)).toFixed(5)
        );
        await supabase
            .from("servers")
            .update({
                hourly_cost: newHourly,
                monthly_cost: Number((newHourly * 720).toFixed(2)),
                details: {
                    ...(server.details ?? {}),
                    linode: { ...linodeDetails, backups_enabled: backupsEnabled },
                },
            })
            .eq("id", serverId);
        if (server.billing_service_id) {
            await BillingCredits.rerateActiveCompute({
                serviceId: server.billing_service_id,
                hourlyRate: newHourly,
            }).catch((e) => console.error("[VM Backups] re-rate failed:", e));
        }
        return newHourly;
    };

    const audit = (operation: string, metadata?: Record<string, unknown>) =>
        AuditLogService.create({
            user_id: user.id,
            user_email: user.email ?? undefined,
            user_role: "user",
            action: "update",
            service_type: "compute",
            service_id: String(serverId),
            service_name: String(server.name ?? ""),
            metadata: { operation, ...(metadata ?? {}) },
            user_agent: userAgent || undefined,
        }).catch(() => {});

    try {
        if (action === "enable") {
            if (linodeDetails.backups_enabled === true) {
                return { ok: false, status: 400, message: "Backups are already enabled." };
            }
            await enableLinodeBackups(row);
            const newHourly = await rerate(true);
            audit("backups.enable");
            try {
                await NotificationService.create(
                    createServiceNotification({
                        userId: user.id,
                        serviceType: "compute",
                        action: "updated",
                        serviceName: String(server.name ?? `Server #${serverId}`),
                        serviceId: String(serverId),
                        metadata: { operation: "backups_enabled" },
                    })
                );
            } catch {}
            return { ok: true, status: 200, data: { enabled: true, hourlyUSD: newHourly } };
        }

        if (action === "cancel") {
            if (linodeDetails.backups_enabled !== true) {
                return { ok: false, status: 400, message: "Backups are not enabled." };
            }
            await cancelLinodeBackups(row);
            const newHourly = await rerate(false);
            audit("backups.cancel");
            return { ok: true, status: 200, data: { enabled: false, hourlyUSD: newHourly } };
        }

        if (action === "snapshot") {
            const snapshotLabel =
                String(label || "").trim() || `manual-${new Date().toISOString().slice(0, 10)}`;
            if (snapshotLabel.length > 64) {
                return { ok: false, status: 400, message: "Snapshot label is too long." };
            }
            await takeLinodeSnapshot(row, snapshotLabel);
            audit("backups.snapshot", { label: snapshotLabel });
            return { ok: true, status: 200, data: { snapshot: snapshotLabel } };
        }

        // restore
        const backupId = Number(rawBackupId);
        if (!backupId || isNaN(backupId)) {
            return { ok: false, status: 400, message: "backupId is required" };
        }
        const overwriteFinal = overwrite !== false; // default true (restore in place)
        await restoreLinodeBackup(row, backupId, overwriteFinal);
        audit("backups.restore", { backupId, overwrite: overwriteFinal });

        // A restore takes the disk offline for minutes and leaves the instance
        // powered OFF. Without this the row keeps its pre-restore status, so
        // the dashboard shows "running" over a stopped server and the realtime
        // channel has nothing to broadcast. Mirror the resize/rebuild idiom:
        // park the row in `provisioning`, then reconcile the real status.
        const restoreStartedAt = new Date().toISOString();
        await supabase
            .from("servers")
            .update({
                status: "provisioning",
                details: {
                    linode: linodeDetails,
                    provisioning: {
                        stage: "restoring",
                        progress: 10,
                        message: "Restoring your backup…",
                        started_at: restoreStartedAt,
                    },
                },
            })
            .eq("id", serverId);

        const restoreLinodeId = server.linode_id;
        if (restoreLinodeId) {
            after(async () => {
                const svc = await createWorkerClient();
                try {
                    const poll = await waitForLinodeRestore(restoreLinodeId);
                    if (!poll.ok || !poll.instance) {
                        throw new Error(
                            poll.timedOut ? "Restore timed out upstream." : "Restore failed upstream."
                        );
                    }
                    // Linode leaves the instance off after a restore; surface
                    // that honestly so the customer knows to start it.
                    const finalStatus = poll.instance.status === "running" ? "running" : "stopped";
                    await svc
                        .from("servers")
                        .update({
                            status: finalStatus,
                            details: {
                                linode: linodeDetails,
                                provisioning: {
                                    stage: "complete",
                                    progress: 100,
                                    message:
                                        finalStatus === "stopped"
                                            ? "Backup restored — start the server when you're ready."
                                            : "Backup restored.",
                                    started_at: restoreStartedAt,
                                    completed_at: new Date().toISOString(),
                                },
                            },
                        })
                        .eq("id", serverId);
                } catch (e) {
                    console.error(
                        "[Linode Restore] post-restore sync failed for server",
                        serverId,
                        e instanceof Error ? e.message : e
                    );
                    await svc
                        .from("servers")
                        .update({
                            status: "error",
                            details: {
                                linode: linodeDetails,
                                provisioning: {
                                    stage: "failed",
                                    progress: 0,
                                    message: "Restore did not complete. Contact support.",
                                    started_at: restoreStartedAt,
                                    failed_at: new Date().toISOString(),
                                },
                            },
                        })
                        .eq("id", serverId);
                }
            });
        }
        try {
            await NotificationService.create(
                createServiceNotification({
                    userId: user.id,
                    serviceType: "compute",
                    action: "updated",
                    serviceName: String(server.name ?? `Server #${serverId}`),
                    serviceId: String(serverId),
                    metadata: { operation: "backup_restored", backupId },
                })
            );
        } catch {}
        return { ok: true, status: 202, data: { restoring: true } };
    } catch (e) {
        return mapLinodeFlowError(e, "Backup operation failed");
    }
}
