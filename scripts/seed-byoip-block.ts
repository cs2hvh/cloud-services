// Seed a BYOIP CIDR block into a Proxmox host's public IP pool.
//
// CLI mirror of the same operation the admin Auto-Setup form does
// in its "Step 5: BYOIP seeding" phase. Useful when you want to top
// up an existing host without touching the UI.
//
// Usage:
//   tsx scripts/seed-byoip-block.ts \
//     --host-id <id> \
//     --cidr 46.236.217.0/24 \
//     [--label "BYOIP routed"] \
//     [--skip-first 1] [--skip-last 1]
//
// What it does (using lib/proxmox/byoip-pool.ts):
//   - Looks up or creates one public_ip_pools row with
//     mac = "route:byoip-<cidr>" + label
//   - Inserts every usable address from the CIDR as a public_ip_pool_ips row
//   - Idempotent — re-running only inserts new addresses
//
// vMACs are NOT created here. They're minted on-demand at VM-create
// time when network_mode=ovh_failover_vmac (lib/proxmox/on-demand-vmac.ts).

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { seedRoutedPool } from "../lib/proxmox/byoip-pool";

type Args = {
    hostId: string;
    cidr: string;
    label?: string;
    skipFirst?: number;
    skipLast?: number;
};

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
    };
    const hostId = get("--host-id");
    const cidr = get("--cidr");
    if (!hostId || !cidr) {
        console.error("Required: --host-id <id> --cidr <a.b.c.d/n>");
        console.error("Optional: --label <text> --skip-first <n> --skip-last <n>");
        process.exit(1);
    }
    return {
        hostId,
        cidr,
        label: get("--label"),
        skipFirst: get("--skip-first") ? Number(get("--skip-first")) : undefined,
        skipLast: get("--skip-last") ? Number(get("--skip-last")) : undefined,
    };
}

async function main() {
    const args = parseArgs();
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
        process.exit(1);
    }
    const sb = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // Confirm the host exists before doing any writes
    const { data: host, error: hostErr } = await sb
        .from("proxmox_hosts")
        .select("id,name,region,network_mode")
        .eq("id", args.hostId)
        .maybeSingle();
    if (hostErr) {
        console.error(`Host lookup failed: ${hostErr.message}`);
        process.exit(1);
    }
    if (!host) {
        console.error(`Host ${args.hostId} not found`);
        process.exit(1);
    }

    console.log(`Host:        ${host.name} (region=${host.region ?? "—"}, mode=${host.network_mode ?? "—"})`);
    console.log(`CIDR:        ${args.cidr}`);

    const result = await seedRoutedPool({
        supabase: sb,
        hostId: args.hostId,
        cidr: args.cidr,
        options: { label: args.label, skipFirst: args.skipFirst, skipLast: args.skipLast },
        onProgress: (m) => console.log(`  ${m}`),
    });

    console.log("");
    console.log(`Pool id:     ${result.poolId}`);
    console.log(`Label:       ${result.label}`);
    console.log(`Usable:      ${result.usableTotal}`);
    console.log(`Already in:  ${result.alreadyInPool}`);
    console.log(`Inserted:    ${result.inserted}`);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
