// Read-only inspector — dumps current proxmox_hosts + related
// network state so we can plan the implementation work from real
// data instead of guesses. Run with: tsx scripts/inspect-proxmox-hosts.ts
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
        process.exit(1);
    }
    const sb = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log("\n=== proxmox_hosts ===\n");
    const hosts = await sb
        .from("proxmox_hosts")
        .select(
            "id,name,host_url,node,storage,bridge,provider,server_series,network_mode,region,display_region,vm_private_cidr,vm_private_gateway,vm_private_ip_start,public_prefix_length,gateway_ip,dns_primary,dns_secondary,total_cpu_cores,total_memory_mb,total_disk_gb,is_active"
        )
        .order("region", { ascending: true });
    if (hosts.error) {
        console.error("hosts query error:", hosts.error.message);
    } else {
        for (const h of hosts.data ?? []) {
            console.log(`-- ${h.name} (${h.region ?? "no-region"}) --`);
            for (const [k, v] of Object.entries(h)) {
                if (v === null || v === undefined || v === "") continue;
                if (k === "id") continue;
                console.log(`  ${k}: ${v}`);
            }
            console.log("");
        }
    }

    console.log("\n=== public_ip_pools (count by host + mode hint) ===\n");
    const pools = await sb
        .from("public_ip_pools")
        .select("id,host_id,mac,label,is_active");
    if (pools.error) {
        console.error("pools query error:", pools.error.message);
    } else {
        const byHost: Record<string, number> = {};
        for (const p of pools.data ?? []) {
            const k = `${p.host_id ?? "no-host"} · ${p.label ?? "no-label"} · mac=${p.mac ?? "none"}`;
            byHost[k] = (byHost[k] || 0) + 1;
        }
        for (const [k, n] of Object.entries(byHost)) {
            console.log(`  ${n}× ${k}`);
        }
    }

    console.log("\n=== public_ip_pool_ips (count by status) ===\n");
    const ips = await sb
        .from("public_ip_pool_ips")
        .select("pool_id,ip,status");
    if (ips.error) {
        console.error("ips query error:", ips.error.message);
    } else {
        const byStatus: Record<string, number> = {};
        const byPool: Record<string, { total: number; sample: string }> = {};
        for (const r of ips.data ?? []) {
            byStatus[r.status ?? "null"] = (byStatus[r.status ?? "null"] || 0) + 1;
            const pid = r.pool_id ?? "no-pool";
            if (!byPool[pid]) byPool[pid] = { total: 0, sample: r.ip };
            byPool[pid].total += 1;
        }
        console.log("By status:");
        for (const [k, n] of Object.entries(byStatus)) console.log(`  ${n}× ${k}`);
        console.log("\nBy pool (with one sample IP):");
        for (const [pid, info] of Object.entries(byPool)) {
            console.log(`  pool ${pid}: ${info.total} ips, e.g. ${info.sample}`);
        }
    }

    console.log("\n=== servers (VM rows — count by status + host) ===\n");
    const servers = await sb
        .from("servers")
        .select("id,host_id,status,vmid,name");
    if (servers.error) {
        console.error("servers query error:", servers.error.message);
    } else {
        const byHostStatus: Record<string, number> = {};
        for (const s of servers.data ?? []) {
            const k = `${s.host_id ?? "no-host"} · ${s.status ?? "no-status"}`;
            byHostStatus[k] = (byHostStatus[k] || 0) + 1;
        }
        for (const [k, n] of Object.entries(byHostStatus)) console.log(`  ${n}× ${k}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
