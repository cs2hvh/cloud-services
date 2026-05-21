// Admin endpoint to sync OVH vMACs for one Proxmox host.
//
// GET  /api/admin/proxmox/hosts/[id]/sync-vmacs
//   Returns the current vMAC state (preview, no mutations).
//
// POST /api/admin/proxmox/hosts/[id]/sync-vmacs?limit=10
//   Creates up to `limit` vMACs for IPs that don't have one yet,
//   capped at 32 total per server (OVH limit). Each new vMAC is
//   persisted as a public_ip_pools row + public_ip_pool_ips row.
//
// Notes:
//   - Sequential (not parallel) to keep below OVH's rate budget and
//     so failures can be reported per-IP. Each iteration is ~30-90s.
//   - Idempotent: re-running with the same input only creates vMACs
//     for IPs that still lack one.
//   - Resilient: if a single IP fails (OVH task error, IP not
//     present, etc.), the loop continues and reports per-IP results.

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
    OVH_VMAC_CAP_PER_SERVER,
    buildVmacReport,
    createVirtualMac,
    listVirtualMacs,
    listVmacAddresses,
    pollTaskUntilDone,
} from "@/lib/ovh/dedicated-server";

export const dynamic = "force-dynamic";

type HostRow = {
    id: string;
    name: string;
    host_url: string;
    provider: string | null;
    server_series: string | null;
    network_mode: string | null;
};

async function loadHost(id: string): Promise<HostRow | null> {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
        .from("proxmox_hosts")
        .select("id,name,host_url,provider,server_series,network_mode")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return data as HostRow;
}

// ─── GET — return vMAC state preview ─────────────────────────────
export async function GET(
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
                error: `Could not derive OVH service name from host_url "${host.host_url}" (expected nsNNNNN.ip-X-Y-Z.net format)`,
            },
            { status: 400 }
        );
    }

    try {
        const creds = readOvhCredentialsFromEnv();
        const report = await buildVmacReport(creds, serviceName);
        return NextResponse.json({
            ok: true,
            host: { id: host.id, name: host.name },
            serviceName,
            cap: OVH_VMAC_CAP_PER_SERVER,
            currentVmacCount: report.virtualMacs.length,
            capRemaining: report.capRemaining,
            failoverIpsTotal: report.failoverIpsClean.length,
            unboundIpsCount: report.unboundIps.length,
            unboundIps: report.unboundIps,
            boundIps: Array.from(report.boundIps),
            virtualMacs: report.virtualMacs.map((mac) => ({
                mac,
                ips: report.vmacIpMap[mac] ?? [],
            })),
        });
    } catch (e) {
        return errorResponse(e);
    }
}

// ─── POST — actually create vMACs ────────────────────────────────
export async function POST(
    req: NextRequest,
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

    const { searchParams } = new URL(req.url);
    const limit = clamp(
        Number.parseInt(searchParams.get("limit") || "10", 10) || 10,
        1,
        OVH_VMAC_CAP_PER_SERVER
    );

    let credsResult;
    try {
        credsResult = readOvhCredentialsFromEnv();
    } catch (e) {
        return errorResponse(e);
    }
    const creds = credsResult;

    // Phase 1: build the report
    let report;
    try {
        report = await buildVmacReport(creds, serviceName);
    } catch (e) {
        return errorResponse(e);
    }

    const targetIps = report.unboundIps.slice(
        0,
        Math.min(limit, report.capRemaining)
    );

    if (targetIps.length === 0) {
        return NextResponse.json({
            ok: true,
            host: { id: host.id, name: host.name },
            serviceName,
            message:
                report.capRemaining === 0
                    ? `Cap reached — 32/32 vMACs already exist on this server. Add another OVH dedicated server to grow vMAC capacity.`
                    : `No unbound failover IPs available. Configure more IPs on this OVH server first.`,
            created: [],
            skipped: [],
            errors: [],
            capRemaining: report.capRemaining,
            currentVmacCount: report.virtualMacs.length,
        });
    }

    // Phase 2: sequential create + poll + persist
    const supabase = createServerSupabase();
    const created: Array<{ ip: string; mac: string }> = [];
    const errors: Array<{ ip: string; error: string }> = [];
    const knownMacs = new Set(report.virtualMacs);

    for (const ip of targetIps) {
        try {
            // Submit
            const task = await createVirtualMac(creds, serviceName, {
                ipAddress: ip,
                type: "ovh",
                virtualMachineName: `ahura-${ip.replace(/\./g, "-")}`,
            });

            // Poll
            await pollTaskUntilDone(creds, serviceName, task.taskId);

            // Identify the new MAC by diffing — listVirtualMacs is
            // authoritative once the task is done
            const after = await listVirtualMacs(creds, serviceName);
            const newMac = after.find((m) => !knownMacs.has(m));

            if (!newMac) {
                // Fallback: maybe the MAC appeared but our snapshot
                // didn't catch it. Look up vMACs whose IPs contain ours.
                let resolvedMac: string | null = null;
                for (const m of after) {
                    if (knownMacs.has(m)) continue;
                    try {
                        const ips = await listVmacAddresses(creds, serviceName, m);
                        if (ips.includes(ip)) {
                            resolvedMac = m;
                            break;
                        }
                    } catch {
                        /* ignore */
                    }
                }
                if (!resolvedMac) {
                    errors.push({
                        ip,
                        error:
                            "vMAC task completed but could not identify the new MAC address",
                    });
                    continue;
                }
                knownMacs.add(resolvedMac);
                await persistVmacPool(supabase, host.id, resolvedMac, ip);
                created.push({ ip, mac: resolvedMac });
            } else {
                knownMacs.add(newMac);
                await persistVmacPool(supabase, host.id, newMac, ip);
                created.push({ ip, mac: newMac });
            }
        } catch (e) {
            errors.push({
                ip,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }

    return NextResponse.json({
        ok: true,
        host: { id: host.id, name: host.name },
        serviceName,
        created,
        errors,
        currentVmacCount: knownMacs.size,
        capRemaining: Math.max(0, OVH_VMAC_CAP_PER_SERVER - knownMacs.size),
    });
}

// ─── DB write — one pool row + one IP row per vMAC ──────────────
async function persistVmacPool(
    supabase: ReturnType<typeof createServerSupabase>,
    hostId: string,
    mac: string,
    ip: string
): Promise<void> {
    // Check if a pool already exists for this MAC on this host (defensive)
    const { data: existing } = await supabase
        .from("public_ip_pools")
        .select("id")
        .eq("host_id", hostId)
        .eq("mac", mac)
        .maybeSingle();

    let poolId: string;
    if (existing && (existing as { id: string }).id) {
        poolId = (existing as { id: string }).id;
    } else {
        const { data: inserted, error: poolErr } = await supabase
            .from("public_ip_pools")
            .insert({
                host_id: hostId,
                mac,
                label: "OVH Additional IP",
                is_active: true,
            })
            .select("id")
            .single();
        if (poolErr || !inserted) {
            throw new Error(`pool insert failed: ${poolErr?.message ?? "unknown"}`);
        }
        poolId = (inserted as { id: string }).id;
    }

    // Insert the IP row (ignore conflict if it's already there)
    const { error: ipErr } = await supabase
        .from("public_ip_pool_ips")
        .insert({ pool_id: poolId, ip });
    if (ipErr && !/duplicate|unique/i.test(ipErr.message)) {
        throw new Error(`ip insert failed: ${ipErr.message}`);
    }
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function errorResponse(e: unknown) {
    if (e instanceof OvhConfigError) {
        return NextResponse.json(
            { ok: false, error: e.message, code: "ovh_config" },
            { status: 500 }
        );
    }
    if (e instanceof OvhApiError) {
        return NextResponse.json(
            {
                ok: false,
                error: e.message,
                code: "ovh_api",
                status: e.status,
            },
            { status: 502 }
        );
    }
    return NextResponse.json(
        {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
        },
        { status: 500 }
    );
}
