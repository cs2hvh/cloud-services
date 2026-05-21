// BYOIP routed pool seeding.
//
// One Proxmox host = one "routed" public_ip_pools row per BYOIP block,
// with mac = `route:byoip-<cidr>` (the `route:` prefix is what the
// VM-create flow checks to identify routed pools). Every usable address
// in the block becomes a public_ip_pool_ips row under that pool.
//
// Idempotent: re-running only inserts addresses not already in the pool.

import type { SupabaseClient } from "@supabase/supabase-js";

import { CidrError, isValidCidr, usableAddresses } from "./cidr";

export type SeedOptions = {
    label?: string;
    skipFirst?: number;
    skipLast?: number;
};

export type SeedResult = {
    poolId: number;
    routedMac: string;
    label: string;
    usableTotal: number;
    alreadyInPool: number;
    inserted: number;
};

/** Insert chunk size — keeps each request comfortably within payload limits. */
const INSERT_CHUNK = 200;

export async function seedRoutedPool(args: {
    supabase: SupabaseClient;
    hostId: string;
    cidr: string;
    options?: SeedOptions;
    onProgress?: (msg: string) => void;
}): Promise<SeedResult> {
    if (!isValidCidr(args.cidr)) {
        throw new CidrError(`Invalid CIDR: ${args.cidr}`);
    }
    const log = args.onProgress ?? (() => {});

    const usable = usableAddresses(args.cidr, {
        skipFirst: args.options?.skipFirst,
        skipLast: args.options?.skipLast,
    });
    const routedMac = `route:byoip-${args.cidr}`;
    const label = args.options?.label ?? `BYOIP routed via vRack ${args.cidr}`;
    log(`Expanded ${args.cidr} → ${usable.length} usable addresses`);

    // Find or create the pool row
    const { data: existing } = await args.supabase
        .from("public_ip_pools")
        .select("id")
        .eq("host_id", args.hostId)
        .eq("mac", routedMac)
        .maybeSingle();

    let poolId: number;
    if (existing) {
        poolId = (existing as { id: number }).id;
        log(`Reusing existing routed pool id=${poolId}`);
    } else {
        const { data: inserted, error } = await args.supabase
            .from("public_ip_pools")
            .insert({ host_id: args.hostId, mac: routedMac, label, is_active: true })
            .select("id")
            .single();
        if (error || !inserted) {
            throw new Error(`Could not create routed pool: ${error?.message ?? "unknown"}`);
        }
        poolId = (inserted as { id: number }).id;
        log(`Created routed pool id=${poolId}`);
    }

    // Diff vs. what's already in the pool
    const { data: existingRows } = await args.supabase
        .from("public_ip_pool_ips")
        .select("ip")
        .eq("pool_id", poolId);
    const have = new Set<string>(
        (existingRows ?? []).map((r) => String((r as { ip: string }).ip))
    );
    const toInsert = usable.filter((ip) => !have.has(ip));

    if (toInsert.length === 0) {
        log(`Pool already in sync (${have.size} addresses)`);
        return {
            poolId,
            routedMac,
            label,
            usableTotal: usable.length,
            alreadyInPool: have.size,
            inserted: 0,
        };
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + INSERT_CHUNK).map((ip) => ({ pool_id: poolId, ip }));
        const { error } = await args.supabase.from("public_ip_pool_ips").insert(chunk);
        if (error && !/duplicate|unique/i.test(error.message)) {
            throw new Error(`IP insert failed at offset ${i}: ${error.message}`);
        }
        inserted += chunk.length;
        log(`Inserted ${inserted}/${toInsert.length} addresses`);
    }
    return {
        poolId,
        routedMac,
        label,
        usableTotal: usable.length,
        alreadyInPool: have.size,
        inserted,
    };
}
