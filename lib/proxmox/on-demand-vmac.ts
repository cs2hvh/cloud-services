// On-demand OVH vMAC allocation.
//
// When network_mode = ovh_failover_vmac and the VM-create flow needs
// a (mac, ip) pair but the host's routed BYOIP pool has IPs without
// MACs, mint a fresh vMAC via the OVH API:
//
//   1. Snapshot existing vMACs on the dedicated server.
//   2. POST /dedicated/server/<svc>/virtualMac with the chosen IP.
//   3. Poll the OVH task until status = "done" (30-90s typically).
//   4. Diff listVirtualMacs() to identify the new MAC.
//   5. Persist a new public_ip_pools row (mac, label) + public_ip_pool_ips
//      row (ip) so subsequent reads see it.
//
// Called from both admin and customer VM-create paths.

import type { SupabaseClient } from "@supabase/supabase-js";

import { OvhApiError, extractOvhServiceName, readOvhCredentialsFromEnv } from "@/lib/ovh/client";
import {
    createVirtualMac,
    deleteVirtualMac,
    listVirtualMacs,
    listVmacAddresses,
    pollTaskUntilDone,
} from "@/lib/ovh/dedicated-server";

export type AllocatedVmac = { ip: string; mac: string };

export type HostRef = {
    id: string;
    host_url: string;
    provider?: string | null;
};

/**
 * Provision a vMAC for `ip` and persist it as a new pool row on `host`.
 *
 * Resilient to leftover state: if OVH says a vMAC already exists for
 * this IP (e.g. previous VM was deleted without releasing it, or
 * operator created one manually), we find the existing MAC and reuse
 * it instead of erroring. The DB pool row is upserted either way.
 *
 * Throws on unrecoverable failure (auth error, task timeout that's
 * not the "already exists" case, DB error). Caller releases outer
 * locks on throw.
 */
export async function allocateVmacForIp(args: {
    supabase: SupabaseClient;
    host: HostRef;
    ip: string;
}): Promise<AllocatedVmac> {
    const { supabase, host, ip } = args;

    if ((host.provider || "ovh") !== "ovh") {
        throw new Error(`On-demand vMAC requires provider=ovh (got "${host.provider}")`);
    }
    const serviceName = extractOvhServiceName(host.host_url);
    if (!serviceName) {
        throw new Error(`Cannot derive OVH service name from host_url "${host.host_url}"`);
    }
    const creds = readOvhCredentialsFromEnv();

    const before = new Set(await listVirtualMacs(creds, serviceName));

    let newMac: string | undefined;
    try {
        const task = await createVirtualMac(creds, serviceName, {
            ipAddress: ip,
            type: "ovh",
            virtualMachineName: `ahura-${ip.replace(/\./g, "-")}`,
        });
        await pollTaskUntilDone(creds, serviceName, task.taskId);

        const after = await listVirtualMacs(creds, serviceName);
        newMac = after.find((m) => !before.has(m));
        if (!newMac) {
            // Polling-race fallback: scan for any newly-added MAC bound to our IP
            newMac = await findMacBoundToIp(creds, serviceName, ip, before);
        }
        if (!newMac) {
            throw new Error(`OVH task ${task.taskId} completed but new MAC could not be identified`);
        }
    } catch (e) {
        // Recovery: OVH already has a vMAC for this IP. Reuse it.
        if (
            e instanceof OvhApiError &&
            /already exists/i.test(e.body || "")
        ) {
            const existing = await findMacBoundToIp(creds, serviceName, ip);
            if (!existing) {
                throw new Error(
                    `OVH reported a vMAC already exists for ${ip} but no MAC binding matches — manual cleanup required.`
                );
            }
            newMac = existing;
        } else {
            throw e;
        }
    }

    await upsertVmacPoolRow(supabase, host.id, newMac, ip);
    return { ip, mac: newMac };
}

/**
 * Release the on-demand vMAC that was allocated for `ip` on `host`.
 *
 * - Looks up the public_ip_pools row whose mac is real (not "route:")
 *   and whose public_ip_pool_ips child matches `ip`.
 * - Calls OVH DELETE /dedicated/server/<svc>/virtualMac/<mac> and
 *   polls the task. Tolerates upstream errors — we don't want a
 *   transient OVH failure to block VM deletion.
 * - Deletes the DB pool row regardless. Stale OVH state can be
 *   cleaned manually; stale DB state is worse because it causes
 *   the next on-demand allocation to fail.
 *
 * Returns { released: true, mac } if any work was done, or
 * { released: false } if no on-demand vMAC pool was found for this IP.
 */
export async function releaseOnDemandVmac(args: {
    supabase: SupabaseClient;
    host: HostRef;
    ip: string;
}): Promise<{ released: boolean; mac?: string; ovhDeleted?: boolean }> {
    const { supabase, host, ip } = args;

    // Find pool rows for this host that have this IP and a non-route mac
    const { data: rows } = await supabase
        .from("public_ip_pools")
        .select("id, mac, public_ip_pool_ips!inner(ip)")
        .eq("host_id", host.id)
        .eq("public_ip_pool_ips.ip", ip);

    type Row = { id: number; mac: string };
    const pools = (rows ?? []) as Row[];
    const vmacPool = pools.find((p) => !String(p.mac).toLowerCase().startsWith("route:"));
    if (!vmacPool) return { released: false };

    let ovhDeleted = false;
    if ((host.provider || "ovh") === "ovh") {
        try {
            const serviceName = extractOvhServiceName(host.host_url);
            if (serviceName) {
                const creds = readOvhCredentialsFromEnv();
                const task = await deleteVirtualMac(creds, serviceName, vmacPool.mac);
                await pollTaskUntilDone(creds, serviceName, task.taskId).catch(() => {});
                ovhDeleted = true;
            }
        } catch (e) {
            console.warn(
                `[releaseOnDemandVmac] OVH delete failed for ${vmacPool.mac} (${ip}): ${
                    e instanceof Error ? e.message : String(e)
                } — removing DB row anyway`
            );
        }
    }

    await supabase.from("public_ip_pools").delete().eq("id", vmacPool.id);
    return { released: true, mac: vmacPool.mac, ovhDeleted };
}

// ─── Internal helpers ────────────────────────────────────────────

async function findMacBoundToIp(
    creds: ReturnType<typeof readOvhCredentialsFromEnv>,
    serviceName: string,
    ip: string,
    skip?: Set<string>
): Promise<string | undefined> {
    const macs = await listVirtualMacs(creds, serviceName);
    for (const m of macs) {
        if (skip?.has(m)) continue;
        try {
            const ips = await listVmacAddresses(creds, serviceName, m);
            if (ips.includes(ip)) return m;
        } catch {
            /* keep looking */
        }
    }
    return undefined;
}

async function upsertVmacPoolRow(
    supabase: SupabaseClient,
    hostId: string,
    mac: string,
    ip: string
): Promise<void> {
    // Idempotent: try insert, swallow unique violations (mac UNIQUE
    // per host). If the pool already exists, reuse its id.
    const insertResult = await supabase
        .from("public_ip_pools")
        .insert({
            host_id: hostId,
            mac,
            label: `Virtual MAC (on-demand for ${ip})`,
            is_active: true,
        })
        .select("id")
        .single();
    let pool = insertResult.data;
    const poolErr = insertResult.error;

    if (poolErr) {
        if (!/duplicate|unique/i.test(poolErr.message)) {
            throw new Error(`Could not save vMAC pool: ${poolErr.message}`);
        }
        const { data: existing, error: lookupErr } = await supabase
            .from("public_ip_pools")
            .select("id")
            .eq("host_id", hostId)
            .eq("mac", mac)
            .single();
        if (lookupErr || !existing) {
            throw new Error(`Could not locate existing vMAC pool after unique conflict: ${lookupErr?.message ?? "?"}`);
        }
        pool = existing;
    }

    if (!pool) throw new Error("vMAC pool upsert returned no id");
    const poolId = (pool as { id: number }).id;
    const { error: ipErr } = await supabase
        .from("public_ip_pool_ips")
        .insert({ pool_id: poolId, ip });
    if (ipErr && !/duplicate|unique/i.test(ipErr.message)) {
        throw new Error(`Could not save IP for vMAC pool: ${ipErr.message}`);
    }
}

/**
 * Heuristic: does this `mac`/`label` look like a routed BYOIP pool
 * (no real MAC, just a placeholder for IPs that need vMACs minted
 * on demand)?
 */
export function isRoutedPool(mac?: string | null, label?: string | null): boolean {
    const m = String(mac || "").toLowerCase();
    const l = String(label || "").toLowerCase();
    return m.startsWith("route:") || l.includes("byoip") || l.includes("routed");
}
