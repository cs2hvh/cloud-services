// Admin endpoint: import existing OVH virtual MACs into the
// public_ip_pools table so the VM-create flow can use them.
//
// Background: the OVH integration's "Sync" button only creates
// NEW vMACs for failover IPs that don't have one yet. If the
// operator already created some vMACs in OVH's UI before this app
// was wired up, those exist on OVH's side but aren't in our DB
// pool — so the VM-create flow can't pick them.
//
// This endpoint walks every vMAC OVH has on the dedicated server,
// looks up which IP(s) it's bound to, and inserts a public_ip_pools
// row (+ public_ip_pool_ips row per IP) for any that aren't already
// in the DB. Idempotent — re-running only inserts new rows.

import { NextRequest, NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/auth";
import {
    OvhApiError,
    OvhConfigError,
    extractOvhServiceName,
    readOvhCredentialsFromEnv,
} from "@/lib/ovh/client";
import {
    listVirtualMacs,
    listVmacAddresses,
} from "@/lib/ovh/dedicated-server";

export const dynamic = "force-dynamic";

type HostRow = {
    id: string;
    name: string;
    host_url: string;
    provider: string | null;
};

async function loadHost(id: string): Promise<HostRow | null> {
    const sb = createServerSupabase();
    const { data } = await sb
        .from("proxmox_hosts")
        .select("id,name,host_url,provider")
        .eq("id", id)
        .single();
    return (data as HostRow | null) ?? null;
}

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if (!auth.ok) {
        return NextResponse.json(
            { ok: false, error: "Not authorized" },
            { status: 403 }
        );
    }
    const { id } = await params;
    const host = await loadHost(id);
    if (!host) {
        return NextResponse.json(
            { ok: false, error: "Host not found" },
            { status: 404 }
        );
    }
    if (host.provider !== "ovh") {
        return NextResponse.json(
            { ok: false, error: "Host is not an OVH-managed host" },
            { status: 400 }
        );
    }
    const serviceName = extractOvhServiceName(host.host_url);
    if (!serviceName) {
        return NextResponse.json(
            {
                ok: false,
                error: `Could not derive OVH service name from host_url "${host.host_url}"`,
            },
            { status: 400 }
        );
    }

    let creds;
    try {
        creds = readOvhCredentialsFromEnv();
    } catch (e) {
        if (e instanceof OvhConfigError) {
            return NextResponse.json(
                { ok: false, error: e.message, code: "ovh_config" },
                { status: 500 }
            );
        }
        throw e;
    }

    // Snapshot OVH state
    let macs: string[];
    try {
        macs = await listVirtualMacs(creds, serviceName);
    } catch (e) {
        if (e instanceof OvhApiError) {
            return NextResponse.json(
                { ok: false, error: e.message, code: "ovh_api", status: e.status },
                { status: 502 }
            );
        }
        throw e;
    }

    const ovhPairs: Array<{ mac: string; ip: string }> = [];
    for (const mac of macs) {
        try {
            const ips = await listVmacAddresses(creds, serviceName, mac);
            for (const ip of ips) ovhPairs.push({ mac, ip });
        } catch {
            // skip macs whose IP listing fails — they'll show up next run
        }
    }

    if (ovhPairs.length === 0) {
        return NextResponse.json({
            ok: true,
            host: { id: host.id, name: host.name },
            serviceName,
            macsTotal: macs.length,
            imported: [],
            skipped: [],
            message: "OVH has no vMAC ↔ IP bindings to import on this server.",
        });
    }

    // Snapshot DB state — which (mac, ip) pairs are already in pool
    const supabase = createServerSupabase();
    const { data: existingPools } = await supabase
        .from("public_ip_pools")
        .select("id, mac, public_ip_pool_ips ( id, ip )")
        .eq("host_id", id);

    type DbPool = {
        id: string;
        mac: string;
        public_ip_pool_ips: Array<{ id: string; ip: string }>;
    };
    const dbPools = (existingPools ?? []) as DbPool[];
    const dbPairs = new Set<string>();
    const macToPoolId = new Map<string, string>();
    for (const p of dbPools) {
        macToPoolId.set(p.mac, p.id);
        for (const r of p.public_ip_pool_ips ?? []) {
            dbPairs.add(`${p.mac}|${r.ip}`);
        }
    }

    // Diff
    const imported: Array<{ mac: string; ip: string }> = [];
    const skipped: Array<{ mac: string; ip: string; reason: string }> = [];
    const errors: Array<{ mac: string; ip: string; error: string }> = [];

    for (const pair of ovhPairs) {
        const key = `${pair.mac}|${pair.ip}`;
        if (dbPairs.has(key)) {
            skipped.push({ ...pair, reason: "already in DB" });
            continue;
        }

        // Get or create the pool row for this MAC
        let poolId = macToPoolId.get(pair.mac);
        if (!poolId) {
            const { data: inserted, error: insertErr } = await supabase
                .from("public_ip_pools")
                .insert({
                    host_id: id,
                    mac: pair.mac,
                    label: "OVH Additional IP (imported)",
                    is_active: true,
                })
                .select("id")
                .single();
            if (insertErr || !inserted) {
                errors.push({
                    ...pair,
                    error: `pool insert: ${insertErr?.message ?? "unknown"}`,
                });
                continue;
            }
            poolId = (inserted as { id: string }).id;
            macToPoolId.set(pair.mac, poolId);
        }

        // Insert the IP row
        const { error: ipErr } = await supabase
            .from("public_ip_pool_ips")
            .insert({ pool_id: poolId, ip: pair.ip });
        if (ipErr) {
            // Tolerate unique-violation if a concurrent insert beat us
            if (!/duplicate|unique/i.test(ipErr.message)) {
                errors.push({ ...pair, error: `ip insert: ${ipErr.message}` });
                continue;
            }
        }

        imported.push(pair);
        dbPairs.add(key);
    }

    return NextResponse.json({
        ok: true,
        host: { id: host.id, name: host.name },
        serviceName,
        macsTotal: macs.length,
        ovhPairsTotal: ovhPairs.length,
        imported,
        skipped,
        errors,
        message:
            imported.length > 0
                ? `Imported ${imported.length} OVH vMAC binding${imported.length === 1 ? "" : "s"} into the pool.`
                : "Nothing new to import — pool is already in sync with OVH.",
    });
}
