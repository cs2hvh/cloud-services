// Auto-setup endpoint for a new Proxmox host.
//
// Orchestrates, in one streamed run:
//   1. proxmox_hosts row (idempotent — lookup-by-name reuses an existing id)
//   2. Capacity probe via Proxmox API → CPU/RAM/disk auto-fill
//   3. Default cloud-init snippet deploy via SSH
//   4. Linux template build (spawns scripts/create-linux-template.js)
//   5. BYOIP routed pool seeding
//
// vMAC creation is NOT done here — it happens on-demand at VM-create
// time (lib/proxmox/on-demand-vmac.ts).
//
// Streams NDJSON events; the admin UI renders them in a live console.

import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

import { requireAdmin } from "@/lib/supabase/auth";
import { createWorkerClient } from "@/lib/supabase/server";
import { writeCloudInitSnippet } from "@/lib/proxmox-utils";
import {
    DEFAULT_LINUX_CLOUD_INIT_FILENAME,
    DEFAULT_LINUX_CLOUD_INIT_SNIPPET,
} from "@/lib/proxmox/default-snippet";
import {
    detectHostCapacity,
    formatDisk,
    formatMemory,
    type DetectedCapacity,
} from "@/lib/proxmox/capacity";
import { seedRoutedPool } from "@/lib/proxmox/byoip-pool";
import { isValidCidr } from "@/lib/proxmox/cidr";

export const dynamic = "force-dynamic";
export const maxDuration = 1800;

// ─── Body shape + validation ─────────────────────────────────────
type Body = {
    name?: string;
    host_url?: string;
    username?: string;
    password?: string;
    node?: string;
    storage?: string;
    bridge?: string;
    region?: string;
    display_region?: string;
    provider?: string;
    server_series?: string;
    network_mode?: string;
    gateway_ip?: string;
    dns_primary?: string;
    dns_secondary?: string;
    byoip_cidr?: string;
    skip_templates?: boolean;
    vmids?: string;
    reuse_existing_host_id?: string;
    total_cpu_cores?: number;
    total_memory_mb?: number;
    total_disk_gb?: number;
};

const MAX_NAME = 64;
const MAX_URL = 256;
const VMID_RE = /^\d{1,6}$/;
const PROVIDER_VALUES = new Set(["ovh", "generic"]);
const NETWORK_MODE_VALUES = new Set([
    "legacy_public_gateway",
    "ovh_failover_vmac",
    "ovh_hg_scale_routed",
    "ovh_advance_gen3_routed",
    "ovh_vrack_block",
]);

function validate(body: Body): { ok: true } | { ok: false; error: string } {
    const required = [
        ["name", body.name],
        ["host_url", body.host_url],
        ["username", body.username],
        ["password", body.password],
        ["node", body.node],
    ] as const;
    const missing = required.filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) return { ok: false, error: `Missing required fields: ${missing.join(", ")}` };

    if ((body.name?.length ?? 0) > MAX_NAME) return { ok: false, error: "name too long" };
    if ((body.host_url?.length ?? 0) > MAX_URL) return { ok: false, error: "host_url too long" };
    if (body.host_url && !/^https?:\/\//i.test(body.host_url)) {
        return { ok: false, error: "host_url must start with http:// or https://" };
    }
    if (body.provider && !PROVIDER_VALUES.has(body.provider)) {
        return { ok: false, error: `provider must be one of: ${[...PROVIDER_VALUES].join(", ")}` };
    }
    if (body.network_mode && !NETWORK_MODE_VALUES.has(body.network_mode)) {
        return { ok: false, error: `network_mode must be one of: ${[...NETWORK_MODE_VALUES].join(", ")}` };
    }
    if (body.byoip_cidr && !isValidCidr(body.byoip_cidr)) {
        return { ok: false, error: `byoip_cidr is not a valid CIDR` };
    }
    if (body.vmids) {
        const ids = body.vmids.split(",").map((s) => s.trim()).filter(Boolean);
        if (ids.some((v) => !VMID_RE.test(v))) {
            return { ok: false, error: `vmids must be comma-separated integers` };
        }
    }
    return { ok: true };
}

// ─── HTTP handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return jsonError(403, "Not authorized");

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return jsonError(400, "Bad JSON body");
    }
    const v = validate(body);
    if (!v.ok) return jsonError(400, v.error);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const emit = makeEmitter(controller, encoder);
            try {
                await runAutoSetup(body, emit);
            } catch (e) {
                emit("error", e instanceof Error ? e.message : String(e));
            } finally {
                try { controller.close(); } catch { /* already closed */ }
            }
        },
    });
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}

function jsonError(status: number, error: string): Response {
    return new Response(JSON.stringify({ ok: false, error }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// ─── Orchestrator ────────────────────────────────────────────────
type EmitType = "step" | "log" | "ok" | "error" | "done";
type Emit = (type: EmitType, message: string, extra?: Record<string, unknown>) => void;

function makeEmitter(controller: ReadableStreamDefaultController<Uint8Array>, enc: TextEncoder): Emit {
    let closed = false;
    return (type, message, extra) => {
        if (closed) return;
        try {
            controller.enqueue(
                enc.encode(JSON.stringify({ type, message, t: Date.now(), ...extra }) + "\n")
            );
        } catch {
            closed = true;
        }
    };
}

async function runAutoSetup(body: Body, emit: Emit): Promise<void> {
    const sb = await createWorkerClient();

    // Step 1: host row (idempotent by name)
    emit("step", "Registering host in proxmox_hosts");
    const hostId = await resolveHostId(sb, body, emit);

    // Step 2: capacity probe
    const detected = await probeCapacity(body, emit);
    const finalGateway = body.gateway_ip || detected.mainPublicIp || null;
    const finalCpu = pick(body.total_cpu_cores, detected.cpuCores);
    const finalMem = pick(body.total_memory_mb, detected.memoryMB);
    const finalDisk = pick(body.total_disk_gb, detected.diskGB);

    const { error: upsertErr } = await sb.from("proxmox_hosts").upsert(
        {
            id: hostId,
            name: body.name,
            host_url: body.host_url,
            username: body.username,
            password: body.password,
            allow_insecure_tls: true,
            node: body.node,
            storage: body.storage || "local",
            bridge: body.bridge || "vmbr0",
            region: body.region || "default",
            display_region: body.display_region || body.region || "Default",
            provider: body.provider || "ovh",
            server_series: body.server_series || "generic",
            network_mode: body.network_mode || "legacy_public_gateway",
            gateway_ip: finalGateway,
            dns_primary: body.dns_primary || "8.8.8.8",
            dns_secondary: body.dns_secondary || "1.1.1.1",
            total_cpu_cores: finalCpu,
            total_memory_mb: finalMem,
            total_disk_gb: finalDisk,
            is_active: true,
        },
        { onConflict: "id" }
    );
    if (upsertErr) {
        emit("error", `Failed to register host: ${upsertErr.message}`);
        return;
    }
    emit(
        "ok",
        `Host registered (id=${hostId}, ${finalCpu} cores / ${finalMem} MB / ${finalDisk} GB)`,
        { hostId }
    );
    if (finalCpu === 0 || finalMem === 0 || finalDisk === 0) {
        emit(
            "log",
            "WARNING: capacity is 0 — the region will show as 'Unavailable' on the customer dashboard until corrected."
        );
    }

    // Step 3: snippet
    emit("step", "Deploying default Linux cloud-init snippet to host");
    try {
        await writeCloudInitSnippet(
            {
                id: hostId,
                name: body.name!,
                host_url: body.host_url!,
                username: body.username!,
                password: body.password!,
                allow_insecure_tls: true,
                token_id: null,
                token_secret: null,
                node: body.node!,
                storage: body.storage || "local",
                bridge: body.bridge || "vmbr0",
                gateway_ip: finalGateway,
                dns_primary: body.dns_primary || null,
                dns_secondary: body.dns_secondary || null,
            },
            DEFAULT_LINUX_CLOUD_INIT_FILENAME,
            DEFAULT_LINUX_CLOUD_INIT_SNIPPET
        );
        emit("ok", `Snippet /var/lib/vz/snippets/${DEFAULT_LINUX_CLOUD_INIT_FILENAME} written`);
    } catch (e) {
        emit(
            "error",
            `Snippet deploy failed: ${msg(e)} — run "node scripts/deploy-snippet.js" later or VMs will fail to start.`
        );
    }

    // Step 4: templates
    if (!body.skip_templates) {
        await buildTemplates(hostId, body, emit);
    } else {
        emit("log", "Skipping template build (skip_templates=true)");
    }

    // Step 5: BYOIP seeding
    if (body.byoip_cidr) {
        emit("step", `Seeding BYOIP ${body.byoip_cidr} as routed pool`);
        try {
            const r = await seedRoutedPool({
                supabase: sb,
                hostId,
                cidr: body.byoip_cidr,
                onProgress: (m) => emit("log", m),
            });
            emit(
                "ok",
                `Routed pool: ${r.inserted} new + ${r.alreadyInPool} existing = ${r.usableTotal} total`
            );
        } catch (e) {
            emit("error", `BYOIP seed failed: ${msg(e)}`);
        }
    } else {
        emit("log", "No BYOIP CIDR provided — skipping IP pool seeding");
    }

    emit("done", "Auto-setup complete", { hostId });
}

// ─── Step helpers ────────────────────────────────────────────────
async function resolveHostId(
    sb: Awaited<ReturnType<typeof createWorkerClient>>,
    body: Body,
    emit: Emit
): Promise<string> {
    if (body.reuse_existing_host_id) return body.reuse_existing_host_id;
    const { data } = await sb
        .from("proxmox_hosts")
        .select("id")
        .eq("name", body.name!)
        .maybeSingle();
    if (data) {
        const id = (data as { id: string }).id;
        emit("log", `Found existing host by name → reusing id=${id}`);
        return id;
    }
    return randomUUID();
}

async function probeCapacity(body: Body, emit: Emit): Promise<DetectedCapacity> {
    emit("log", "Probing Proxmox API for CPU + memory + every storage...");
    try {
        const d = await detectHostCapacity({
            hostUrl: body.host_url!,
            username: body.username!,
            password: body.password!,
            node: body.node!,
            allowInsecure: true,
        });
        const cpuLine = d.cpuModel
            ? `${d.cpuCores ?? "?"} cores (${d.cpuSockets ?? "?"} sockets, ${d.cpuModel})`
            : `${d.cpuCores ?? "?"} cores`;
        const memLine = d.memoryUsedMB !== null
            ? `${formatMemory(d.memoryMB)} (${formatMemory(d.memoryUsedMB)} used)`
            : formatMemory(d.memoryMB);
        emit("log", `  CPU:    ${cpuLine}`);
        emit("log", `  Memory: ${memLine}`);
        if (d.storages.length === 0) {
            emit("log", `  Storage: (none reported)`);
        } else {
            emit("log", `  Storages found: ${d.storages.length}`);
            for (const s of d.storages) {
                const mark = s.counted ? "[+]" : "[-]";
                const sizes = s.totalGB > 0
                    ? `${formatDisk(s.totalGB)} total · ${formatDisk(s.usedGB)} used · ${formatDisk(s.availGB)} free`
                    : "(size unknown)";
                emit(
                    "log",
                    `    ${mark} ${s.name.padEnd(16)} ${s.type.padEnd(8)} ${sizes}  — ${s.reason ?? ""}`
                );
            }
            emit("log", `  Total VM-disk capacity: ${formatDisk(d.diskGB ?? 0)}`);
        }
        emit(
            "log",
            d.mainPublicIp
                ? `  Main public IP: ${d.mainPublicIp} (on ${d.publicIface ?? "?"}) — used as VM gateway in vMAC mode`
                : `  Main public IP: (not detected) — set gateway_ip manually if using vMAC mode`
        );
        if (d.kernelVersion) {
            const uptime = d.uptimeSeconds ? `, uptime ${Math.round(d.uptimeSeconds / 3600)}h` : "";
            emit("log", `  Kernel: ${d.kernelVersion}${uptime}`);
        }
        return d;
    } catch (e) {
        emit("log", `Capacity probe failed (${msg(e)}) — falling back to form values`);
        return EMPTY_CAPACITY;
    }
}

async function buildTemplates(hostId: string, body: Body, emit: Emit): Promise<void> {
    const vmidList = body.vmids
        ? body.vmids.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    if (vmidList.length === 0) {
        emit("step", "Building Linux templates on host (5–15 min)");
        const code = await runChild("node", ["scripts/create-linux-template.js", "--host-id", hostId], emit);
        emit(code === 0 ? "ok" : "error",
            code === 0 ? "All Linux templates built and registered" : `Template build exited with code ${code}`);
        return;
    }
    for (const vmid of vmidList) {
        emit("step", `Building template VMID ${vmid}`);
        const code = await runChild(
            "node",
            ["scripts/create-linux-template.js", "--host-id", hostId, "--vmid", vmid],
            emit
        );
        if (code === 0) emit("ok", `VMID ${vmid} built`);
        else { emit("error", `VMID ${vmid} build exited with code ${code} — stopping`); return; }
    }
}

function runChild(cmd: string, args: string[], emit: Emit): Promise<number> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { env: process.env, shell: process.platform === "win32" });
        let outBuf = "";
        let errBuf = "";
        const flush = (buf: string, isErr: boolean): string => {
            const lines = buf.split(/\r?\n/);
            const tail = lines.pop() ?? "";
            for (const ln of lines) {
                if (ln.length > 0) emit("log", (isErr ? "[stderr] " : "") + ln);
            }
            return tail;
        };
        child.stdout?.on("data", (d: Buffer) => { outBuf = flush(outBuf + d.toString(), false); });
        child.stderr?.on("data", (d: Buffer) => { errBuf = flush(errBuf + d.toString(), true); });
        child.on("error", (e) => { emit("error", `child process error: ${e.message}`); resolve(1); });
        child.on("close", (code) => {
            if (outBuf.length > 0) emit("log", outBuf);
            if (errBuf.length > 0) emit("log", "[stderr] " + errBuf);
            resolve(typeof code === "number" ? code : 1);
        });
    });
}

// ─── Misc ────────────────────────────────────────────────────────
const EMPTY_CAPACITY: DetectedCapacity = {
    cpuCores: null,
    cpuSockets: null,
    cpuModel: null,
    memoryMB: null,
    memoryUsedMB: null,
    diskGB: null,
    storages: [],
    mainPublicIp: null,
    publicIface: null,
    uptimeSeconds: null,
    kernelVersion: null,
};

function pick(formValue: number | undefined, detected: number | null): number {
    return Number(formValue) > 0 ? Number(formValue) : detected ?? 0;
}
function msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
