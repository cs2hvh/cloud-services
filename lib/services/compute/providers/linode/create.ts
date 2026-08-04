// Linode create pipeline — the resell counterpart of the inline Proxmox flow
// in app/api/services/compute/vms/create/route.ts. The route dispatches here
// when platform_settings.compute_provider === 'linode'.
//
// Sequence (billing semantics identical to the Proxmox path):
//   validate → reserveProvision (1h hold) → POST /linode/instances →
//   INSERT servers row (status=provisioning) → respond →
//   after(): poll until running → settleProvision  (or teardown + releaseProvision)
//
// The customer rate is FROZEN here: max(regional hourly × markup, floor)
// (+ backups add-on when enabled) — upstream price drift never re-prices a
// running server.

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LinodeClient } from "@/lib/services/linode/client";
import type {
    LinodeCreateInstanceRequest,
    LinodeError,
    LinodeInstance,
} from "@/lib/services/linode/types";
import {
    findLinodeImage,
    findLinodePlan,
    findLinodeRegion,
    getLinodeCatalog,
    isTypeAvailableInRegion,
    resolveLinodePlanPrice,
} from "@/lib/pricing/linode-catalog";
import { getLinodeDeployEnabled } from "@/lib/admin/platform-settings";
import {
    reserveProvision,
    settleProvision,
    releaseProvision,
} from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";
import { destroyServer } from "@/lib/services/compute/server-lifecycle";
import { sendServiceEventEmail } from "@/lib/services/shared/service-event-email";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";
import { deleteLinodeInstance, pollLinodeInstance } from "./lifecycle";
import { sanitizeProviderMessage } from "./errors";

const PROVISION_TIMEOUT_MS = 10 * 60_000;
const LINODE_PLAN_SLUG_PREFIX = "linode:";

/** shared|dedicated column on servers — Linode classes fold into the two tiers. */
function tierForClass(cls: string): "shared" | "dedicated" {
    return cls === "nanode" || cls === "standard" ? "shared" : "dedicated";
}

/**
 * Linode label rules: 3–64 chars of [a-zA-Z0-9._-], alphanumeric at both ends.
 * Labels are unique per account (shared reseller token!), so a short random
 * suffix is always appended.
 */
export function buildLinodeLabel(requested: string): string {
    const suffix = `-${Math.random().toString(36).slice(2, 7)}`;
    let base = requested
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^[^a-zA-Z0-9]+/, "")
        .replace(/[^a-zA-Z0-9]+$/, "");
    if (base.length < 3) base = `srv-${base}`.replace(/-+$/, "");
    base = base.slice(0, 64 - suffix.length).replace(/[^a-zA-Z0-9]+$/, "");
    return `${base}${suffix}`;
}

/** Server-side floor for Linode's root password policy (UI enforces stronger). */
export function validateRootPassword(pass: string): string | null {
    if (pass.length < 11 || pass.length > 128) {
        return "Root password must be 11-128 characters long.";
    }
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
        re.test(pass)
    ).length;
    if (classes < 2) {
        return "Root password must contain at least two of: uppercase letters, lowercase letters, numbers, punctuation.";
    }
    // The provider runs its own strength check on top of length and character
    // classes, and rejects repetitive passwords. "Qa1!aaaaaaaaaa" satisfies
    // every rule above — and the deploy form's own hints — yet is refused
    // upstream, so the customer only finds out after a full round trip.
    // Catch the obvious case here instead.
    if (/(.)\1{3,}/.test(pass)) {
        return "Root password must not repeat the same character four or more times in a row.";
    }
    return null;
}

function mapLinodeErrorToResponse(le: LinodeError): Response {
    switch (le.code) {
        case "CAPACITY":
            return Response.json(
                { ok: false, error: "This plan is out of stock in the selected region. Please pick a different region or plan." },
                { status: 409 }
            );
        case "INVALID":
            return Response.json(
                {
                    ok: false,
                    error: sanitizeProviderMessage(
                        le.message,
                        "We couldn't create your server with those settings. Please review and try again."
                    ),
                },
                { status: 400 }
            );
        case "RATE_LIMIT":
            return Response.json(
                { ok: false, error: "The provisioning service is busy. Please try again in a moment." },
                { status: 429 }
            );
        case "AUTH":
            console.error("[Linode Create] provider auth failed:", le.message);
            return Response.json(
                { ok: false, error: "The provisioning service is temporarily unavailable. Please try again later." },
                { status: 503 }
            );
        default:
            console.error("[Linode Create] provider error:", le.code, le.message);
            return Response.json(
                { ok: false, error: "Unable to create your server right now. Please try again later." },
                { status: 502 }
            );
    }
}

export interface LinodeCreateArgs {
    user: { id: string; email?: string | null };
    body: Record<string, unknown>;
    supabase: SupabaseClient;
    idempComplete: ((data: unknown) => Promise<void>) | null;
}

export async function handleLinodeCreate({
    user,
    body,
    supabase,
    idempComplete,
}: LinodeCreateArgs): Promise<Response> {
    // Kill-switch blocks CREATE only; day-2 ops on existing rows keep working.
    if (!(await getLinodeDeployEnabled())) {
        return Response.json(
            { ok: false, error: "New server deployments are temporarily disabled. Please try again later." },
            { status: 503 }
        );
    }

    // ── Parse + basic validation ─────────────────────────────────────────────
    const region = String(body.region || "");
    const rawType = String(body.type || body.planSlug || "");
    const typeId = rawType.startsWith(LINODE_PLAN_SLUG_PREFIX)
        ? rawType.slice(LINODE_PLAN_SLUG_PREFIX.length)
        : rawType;
    const imageId = String(body.image || body.os || "");
    const requestedLabel = String(body.label || body.hostname || "");
    const rootPass = String(body.root_pass || body.sshPassword || "");
    const backupsEnabled = body.backups_enabled === true;
    const diskEncryption = body.disk_encryption !== false; // default on where supported
    const sshKeyIds = Array.isArray(body.ssh_key_ids)
        ? (body.ssh_key_ids as unknown[]).map(String).slice(0, 25)
        : [];

    if (!region) return Response.json({ ok: false, error: "region is required" }, { status: 400 });
    if (!typeId) return Response.json({ ok: false, error: "type is required" }, { status: 400 });
    if (!imageId) return Response.json({ ok: false, error: "image is required" }, { status: 400 });
    if (!requestedLabel) {
        return Response.json({ ok: false, error: "label is required" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/.test(requestedLabel)) {
        return Response.json(
            { ok: false, error: "Label must be 3-64 characters of letters, numbers, dots, dashes or underscores, starting and ending with a letter or number." },
            { status: 400 }
        );
    }
    const passError = validateRootPassword(rootPass);
    if (passError) return Response.json({ ok: false, error: passError }, { status: 400 });

    // ── Catalog validation (region / plan / image / availability) ───────────
    const catalog = await getLinodeCatalog(supabase);
    const catalogRegion = findLinodeRegion(catalog, region);
    if (!catalogRegion) {
        return Response.json(
            { ok: false, error: "This region is currently unavailable. Please select a different region." },
            { status: 404 }
        );
    }
    const plan = findLinodePlan(catalog, typeId);
    if (!plan) {
        return Response.json({ ok: false, error: `Unknown plan: ${typeId}` }, { status: 400 });
    }
    const image = findLinodeImage(catalog, imageId);
    if (!image) {
        return Response.json({ ok: false, error: `Unknown image: ${imageId}` }, { status: 400 });
    }
    if (!isTypeAvailableInRegion(catalog, typeId, region)) {
        return Response.json(
            { ok: false, error: `${plan.label} is out of stock in ${catalogRegion.label}. Please pick a different region or plan.` },
            { status: 409 }
        );
    }

    // ── Resolve SSH keys ─────────────────────────────────────────────────────
    let authorizedKeys: string[] = [];
    if (sshKeyIds.length > 0) {
        const { data: keys, error: keysError } = await supabase
            .from("user_ssh_keys")
            .select("id, public_key")
            .eq("user_id", user.id)
            .in("id", sshKeyIds);
        if (keysError) {
            return Response.json(
                { ok: false, error: "Unable to load your SSH keys. Please try again." },
                { status: 500 }
            );
        }
        if ((keys?.length ?? 0) !== sshKeyIds.length) {
            return Response.json(
                { ok: false, error: "One or more selected SSH keys no longer exist." },
                { status: 400 }
            );
        }
        authorizedKeys = (keys ?? []).map((k) => String(k.public_key).trim());
        // Touch last_used_at (best-effort).
        supabase
            .from("user_ssh_keys")
            .update({ last_used_at: new Date().toISOString() })
            .in("id", sshKeyIds)
            .then(() => {}, () => {});
    }

    // ── Freeze the customer rate ─────────────────────────────────────────────
    const price = resolveLinodePlanPrice(plan, region);
    const backupsHourly = backupsEnabled ? price.backupsHourlyUSD ?? 0 : 0;
    const hourlyCost = Number((price.hourlyUSD + backupsHourly).toFixed(5));
    const monthlyCost = Number((hourlyCost * 720).toFixed(2));

    // ── Billing hold (identical semantics to the Proxmox path) ──────────────
    const reservationResult = await reserveProvision({
        userId: user.id,
        initialCost: 0,
        hourlyRate: hourlyCost,
    });
    const reservation = reservationResult.reservation;
    if (!reservationResult.ok) {
        return Response.json(
            { ok: false, error: `Insufficient balance. You need at least $${hourlyCost.toFixed(2)} to create this server.` },
            { status: 402 }
        );
    }

    // ── Create the instance ──────────────────────────────────────────────────
    const label = buildLinodeLabel(requestedLabel);
    const supportsDiskEncryption = catalogRegion.capabilities.includes("Disk Encryption");
    const createPayload: LinodeCreateInstanceRequest = {
        region,
        type: typeId,
        image: imageId,
        label,
        root_pass: rootPass,
        backups_enabled: backupsEnabled,
        tags: ["panel", `owner:${user.id}`],
        ...(authorizedKeys.length > 0 ? { authorized_keys: authorizedKeys } : {}),
        ...(supportsDiskEncryption
            ? { disk_encryption: diskEncryption ? "enabled" : "disabled" }
            : {}),
    };

    let instance: LinodeInstance;
    try {
        instance = await LinodeClient.post<LinodeInstance>("/linode/instances", createPayload);
    } catch (e) {
        await releaseProvision(reservation);
        return mapLinodeErrorToResponse(e as LinodeError);
    }

    const ipPrimary = instance.ipv4?.[0] ?? null;
    const provisioningStarted = new Date().toISOString();
    const linodeDetails = {
        type: typeId,
        class: plan.class,
        image: imageId,
        image_label: image.label,
        region,
        region_label: catalogRegion.label,
        ipv6: instance.ipv6,
        backups_enabled: backupsEnabled,
        disk_encryption: supportsDiskEncryption ? diskEncryption : false,
        backups_hourly_usd: backupsHourly || null,
        list_hourly_usd: price.listHourlyUSD,
    };

    // ── Reserve the DB row (realtime UI tracks details.provisioning) ────────
    let reservationId: number | null = null;
    let billingServiceId: string | null = null;
    try {
        const { data: inserted, error: insertErr } = await supabase
            .from("servers")
            .insert({
                provider: "linode",
                linode_id: instance.id,
                vmid: null,
                node: null,
                name: label,
                ip: ipPrimary,
                os: image.label,
                location: region,
                cpu_cores: plan.vcpus,
                memory_mb: plan.memoryMB,
                disk_gb: plan.diskGB,
                tier: tierForClass(plan.class),
                plan_slug: `${LINODE_PLAN_SLUG_PREFIX}${typeId}`,
                status: "provisioning",
                details: {
                    linode: linodeDetails,
                    provisioning: {
                        stage: "allocating",
                        progress: 15,
                        message: "Provisioning your server...",
                        started_at: provisioningStarted,
                    },
                },
                owner_id: user.id,
                owner_email: user.email || null,
                hourly_cost: hourlyCost,
                monthly_cost: monthlyCost,
                billing_start: new Date().toISOString(),
            })
            .select("id, billing_service_id")
            .single();

        if (insertErr) throw new Error(insertErr.message);
        reservationId = (inserted as { id?: number })?.id ?? null;
        billingServiceId = (inserted as { billing_service_id?: string })?.billing_service_id ?? null;
    } catch (e) {
        // Orphan prevention: the instance exists but we can't track it — remove it.
        console.error("[Linode Create] DB reservation failed:", e instanceof Error ? e.message : e);
        await deleteLinodeInstance(instance.id).catch((delErr) =>
            console.error("[Linode Create] orphan cleanup failed for linode", instance.id, delErr)
        );
        await releaseProvision(reservation);
        return Response.json(
            { ok: false, error: "Unable to reserve your server. Please try again later." },
            { status: 500 }
        );
    }

    const serverId = reservationId;

    const updateStage = async (stage: string, progress: number, message: string, extra?: Record<string, unknown>) => {
        if (serverId == null) return;
        try {
            await supabase
                .from("servers")
                .update({
                    details: {
                        linode: linodeDetails,
                        provisioning: {
                            stage,
                            progress,
                            message,
                            started_at: provisioningStarted,
                            updated_at: new Date().toISOString(),
                        },
                    },
                    ...(extra ?? {}),
                })
                .eq("id", serverId);
        } catch {
            /* realtime progress is best-effort */
        }
    };

    // ── Background: poll to running, then settle billing ────────────────────
    after(async () => {
        try {
            const poll = await pollLinodeInstance(instance.id, {
                until: new Set(["running"]),
                timeoutMs: PROVISION_TIMEOUT_MS,
                onTick: async (i) => {
                    if (i.status === "provisioning") {
                        await updateStage("provisioning", 45, "Deploying the image...");
                    } else if (i.status === "booting") {
                        await updateStage("booting", 80, "Booting your server...");
                    }
                },
            });

            if (!poll.ok) {
                const reason = poll.gone
                    ? "The server disappeared upstream during provisioning."
                    : poll.timedOut
                        ? "Provisioning timed out."
                        : "Provisioning failed upstream.";
                // Best-effort teardown so a half-created instance can't idle-bill us.
                await deleteLinodeInstance(instance.id).catch(() => {});
                if (serverId != null) {
                    await supabase
                        .from("servers")
                        .update({
                            status: "failed",
                            details: {
                                linode: linodeDetails,
                                provisioning: {
                                    stage: "failed",
                                    progress: 0,
                                    message: reason,
                                    started_at: provisioningStarted,
                                    failed_at: new Date().toISOString(),
                                },
                            },
                        })
                        .eq("id", serverId);
                }
                await sendServiceEventEmail({
                    userEmail: user.email,
                    serviceType: "Virtual Server",
                    serviceName: label,
                    event: "failed",
                    errorMessage: reason,
                    actionPath: "/dashboard/services/compute/vps",
                });
                try {
                    await NotificationService.create(
                        createServiceNotification({
                            userId: user.id,
                            serviceType: "compute",
                            action: "failed",
                            serviceName: label,
                            serviceId: serverId != null ? String(serverId) : undefined,
                            error: reason,
                        })
                    );
                } catch {}
                await releaseProvision(reservation);
                return;
            }

            const live = poll.instance!;
            const liveIp = live.ipv4?.[0] ?? ipPrimary;
            if (serverId != null) {
                await supabase
                    .from("servers")
                    .update({
                        status: "running",
                        ip: liveIp,
                        details: {
                            linode: { ...linodeDetails, ipv6: live.ipv6 },
                            provisioning: {
                                stage: "complete",
                                progress: 100,
                                message: "Server is ready!",
                                started_at: provisioningStarted,
                                completed_at: new Date().toISOString(),
                            },
                        },
                    })
                    .eq("id", serverId);
            }

            await sendServiceEventEmail({
                userEmail: user.email,
                serviceType: "Virtual Server",
                serviceName: label,
                event: "ready",
                items: [
                    { label: "Region", value: catalogRegion.label },
                    { label: "IP address", value: String(liveIp ?? "pending") },
                    { label: "Operating system", value: image.label },
                    {
                        label: "Specs",
                        value: `${plan.vcpus} vCPU · ${Math.round(plan.memoryMB / 1024)} GB RAM · ${plan.diskGB} GB disk`,
                    },
                ],
                actionPath: `/dashboard/services/compute/vps/${serverId}`,
            });
            try {
                await NotificationService.create(
                    createServiceNotification({
                        userId: user.id,
                        serviceType: "compute",
                        action: "created",
                        serviceName: label,
                        serviceId: serverId != null ? String(serverId) : undefined,
                        metadata: { region: catalogRegion.label, ip: liveIp },
                    })
                );
            } catch {}

            // Start metered billing. On failure the server must not run free:
            // tear it down and refund the hold (mirrors the Proxmox path).
            if (billingServiceId) {
                try {
                    await settleProvision({
                        reservation: reservationResult.reservation,
                        initialCost: 0,
                        hourlyRate: hourlyCost,
                        serviceId: billingServiceId,
                        serviceType: "compute",
                        addActive: BillingCredits.addActiveCompute,
                    });
                } catch (billingErr) {
                    console.error(
                        "[Linode Create] failed to register compute billing meter — tearing down:",
                        billingErr instanceof Error ? billingErr.message : billingErr
                    );
                    if (serverId != null) {
                        try {
                            await destroyServer(Number(serverId));
                        } catch (teardownErr) {
                            console.error("[Linode Create] teardown after billing failure also failed:", teardownErr);
                        }
                    }
                    await releaseProvision(reservation);
                }
            } else {
                await releaseProvision(reservation);
            }
        } catch (e) {
            const failureMessage = e instanceof Error ? e.message : String(e);
            console.error("[Linode Create] provisioning failed:", failureMessage);
            await deleteLinodeInstance(instance.id).catch(() => {});
            if (serverId != null) {
                try {
                    await supabase
                        .from("servers")
                        .update({
                            status: "failed",
                            details: {
                                linode: linodeDetails,
                                provisioning: {
                                    stage: "failed",
                                    progress: 0,
                                    message: failureMessage,
                                    started_at: provisioningStarted,
                                    failed_at: new Date().toISOString(),
                                },
                            },
                        })
                        .eq("id", serverId);
                } catch {}
            }
            await sendServiceEventEmail({
                userEmail: user.email,
                serviceType: "Virtual Server",
                serviceName: label,
                event: "failed",
                errorMessage: failureMessage,
                actionPath: "/dashboard/services/compute/vps",
            });
            await releaseProvision(reservation);
        }
    });

    // ── Immediate response — client tracks progress via Supabase realtime ───
    const successResponse = {
        ok: true,
        serverId,
        name: label,
        ip: ipPrimary,
        os: image.label,
        region,
        specs: { cpuCores: plan.vcpus, memoryMB: plan.memoryMB, diskGB: plan.diskGB },
        status: "provisioning",
        pricing: {
            hourlyCost,
            monthlyCost,
            initialCharge: hourlyCost,
            backupsHourly: backupsHourly || 0,
        },
        ssh: { username: "root", port: 22 },
    };

    if (idempComplete) {
        await idempComplete(successResponse).catch(() => {});
    }

    return Response.json(successResponse);
}
