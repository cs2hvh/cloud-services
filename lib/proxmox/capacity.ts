// Proxmox capacity probe.
//
// Given Proxmox API credentials + a node name, returns:
//   - CPU layout       (logical CPUs, sockets, model)
//   - Memory           (total + used)
//   - Storage          (every attached storage, with totals/used/avail,
//                       and a `counted` flag indicating whether it
//                       contributes to VM-disk capacity)
//   - Main public IP   (used as VM gateway in vMAC mode)
//   - Kernel / uptime
//
// Used by the auto-setup endpoint to populate `proxmox_hosts.total_*`
// columns so the customer dashboard's region availability check
// passes without the operator typing the numbers manually.

import { Agent as UndiciAgent } from "undici";

import { isPrivateIPv4 } from "./cidr";

export type StorageDetail = {
    name: string;
    type: string;
    content: string;
    active: boolean;
    enabled: boolean;
    totalGB: number;
    usedGB: number;
    availGB: number;
    counted: boolean;
    reason?: string;
};

export type DetectedCapacity = {
    cpuCores: number | null;
    cpuSockets: number | null;
    cpuModel: string | null;
    memoryMB: number | null;
    memoryUsedMB: number | null;
    diskGB: number | null;
    storages: StorageDetail[];
    mainPublicIp: string | null;
    publicIface: string | null;
    uptimeSeconds: number | null;
    kernelVersion: string | null;
};

export type ProbeArgs = {
    hostUrl: string;
    username: string;
    password: string;
    node: string;
    allowInsecure?: boolean;
};

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Probe a Proxmox host. Throws if login fails; nulls otherwise. */
export async function detectHostCapacity(args: ProbeArgs): Promise<DetectedCapacity> {
    const apiBase = normalizeApiBase(args.hostUrl);
    const dispatcher = args.allowInsecure
        ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
        : undefined;
    const ticket = await login(apiBase, args.username, args.password, dispatcher);
    const auth = (extra?: Record<string, string>): RequestInit => {
        const init: RequestInit & { dispatcher?: UndiciAgent } = {
            headers: { Cookie: `PVEAuthCookie=${ticket}`, ...(extra || {}) },
        };
        if (dispatcher) init.dispatcher = dispatcher;
        return init as RequestInit;
    };

    const [cpuMem, storages, ip] = await Promise.all([
        fetchNodeStatus(apiBase, args.node, auth),
        fetchStorages(apiBase, args.node, auth),
        fetchMainPublicIp(apiBase, args.node, auth),
    ]);

    const diskGB =
        storages.filter((s) => s.counted).reduce((sum, s) => sum + s.totalGB, 0) || null;

    return {
        ...cpuMem,
        storages,
        diskGB,
        mainPublicIp: ip.address,
        publicIface: ip.iface,
    };
}

function normalizeApiBase(hostUrl: string): string {
    const https = hostUrl.startsWith("http:") ? hostUrl.replace(/^http:/, "https:") : hostUrl;
    return https.replace(/\/+$/, "");
}

async function login(
    apiBase: string,
    username: string,
    password: string,
    dispatcher?: UndiciAgent
): Promise<string> {
    const usernameWithRealm = username.includes("@") ? username : `${username}@pam`;
    const init: RequestInit & { dispatcher?: UndiciAgent } = {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: usernameWithRealm, password }),
    };
    if (dispatcher) init.dispatcher = dispatcher;
    const res = await fetch(`${apiBase}/api2/json/access/ticket`, init as RequestInit);
    if (!res.ok) throw new Error(`Proxmox login failed (${res.status})`);
    const j = (await res.json()) as { data?: { ticket?: string } };
    const ticket = j?.data?.ticket;
    if (!ticket) throw new Error("Proxmox login returned no ticket");
    return ticket;
}

async function fetchNodeStatus(
    apiBase: string,
    node: string,
    auth: () => RequestInit
): Promise<
    Pick<
        DetectedCapacity,
        "cpuCores" | "cpuSockets" | "cpuModel" | "memoryMB" | "memoryUsedMB" | "uptimeSeconds" | "kernelVersion"
    >
> {
    const res = await fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/status`, auth());
    if (!res.ok) {
        return {
            cpuCores: null,
            cpuSockets: null,
            cpuModel: null,
            memoryMB: null,
            memoryUsedMB: null,
            uptimeSeconds: null,
            kernelVersion: null,
        };
    }
    const j = (await res.json()) as {
        data?: {
            cpuinfo?: { cpus?: number; sockets?: number; model?: string };
            memory?: { total?: number; used?: number };
            uptime?: number;
            kversion?: string;
            "current-kernel"?: { release?: string };
        };
    };
    const d = j?.data ?? {};
    return {
        cpuCores: Number(d.cpuinfo?.cpus ?? 0) || null,
        cpuSockets: Number(d.cpuinfo?.sockets ?? 0) || null,
        cpuModel: d.cpuinfo?.model?.trim() || null,
        memoryMB: bytesToMB(d.memory?.total),
        memoryUsedMB: bytesToMB(d.memory?.used),
        uptimeSeconds: Number(d.uptime ?? 0) || null,
        kernelVersion: d.kversion || d["current-kernel"]?.release || null,
    };
}

async function fetchStorages(
    apiBase: string,
    node: string,
    auth: () => RequestInit
): Promise<StorageDetail[]> {
    const res = await fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/storage`, auth());
    if (!res.ok) return [];
    const j = (await res.json()) as {
        data?: Array<{
            storage: string;
            type: string;
            content: string;
            active: number;
            enabled: number;
            total?: number;
            used?: number;
            avail?: number;
        }>;
    };
    return (j?.data ?? []).map((s) => {
        const content = String(s.content || "");
        const active = Number(s.active) === 1;
        const enabled = Number(s.enabled) === 1;
        const totalGB = bytesToGB(s.total) ?? 0;
        const usedGB = bytesToGB(s.used) ?? 0;
        const availGB = bytesToGB(s.avail) ?? 0;
        const storesVmDisks = /\b(images|rootdir)\b/.test(content);
        const { counted, reason } = classifyStorage({
            enabled,
            active,
            storesVmDisks,
            totalGB,
            type: s.type,
            content,
        });
        return {
            name: s.storage,
            type: s.type,
            content,
            active,
            enabled,
            totalGB,
            usedGB,
            availGB,
            counted,
            reason,
        };
    });
}

function classifyStorage(args: {
    enabled: boolean;
    active: boolean;
    storesVmDisks: boolean;
    totalGB: number;
    type: string;
    content: string;
}): { counted: boolean; reason: string } {
    if (!args.enabled) return { counted: false, reason: "disabled" };
    if (!args.active) return { counted: false, reason: "inactive" };
    if (!args.storesVmDisks)
        return { counted: false, reason: `content=[${args.content || "?"}] — not a VM-disk storage` };
    if (args.totalGB === 0) return { counted: false, reason: "reported 0 bytes total" };
    return { counted: true, reason: `images storage on ${args.type}` };
}

async function fetchMainPublicIp(
    apiBase: string,
    node: string,
    auth: () => RequestInit
): Promise<{ address: string | null; iface: string | null }> {
    const res = await fetch(`${apiBase}/api2/json/nodes/${encodeURIComponent(node)}/network`, auth());
    if (!res.ok) return { address: null, iface: null };
    const j = (await res.json()) as {
        data?: Array<{ iface: string; address?: string }>;
    };
    const ifaces = j?.data ?? [];
    // Prefer vmbr0 with a non-private address
    const vmbr0 = ifaces.find((i) => i.iface === "vmbr0" && i.address && !isPrivateIPv4(i.address));
    if (vmbr0?.address) return { address: vmbr0.address, iface: "vmbr0" };
    // Otherwise any interface with a public IPv4
    for (const i of ifaces) {
        if (i.address && !isPrivateIPv4(i.address)) {
            return { address: i.address, iface: i.iface };
        }
    }
    return { address: null, iface: null };
}

function bytesToGB(b?: number): number | null {
    if (!b || b < 0) return null;
    return Math.floor(b / BYTES_PER_GB);
}
function bytesToMB(b?: number): number | null {
    if (!b || b < 0) return null;
    return Math.floor(b / BYTES_PER_MB);
}

/** Pretty-print MB as MB or GiB. */
export function formatMemory(mb: number | null): string {
    if (!mb) return "?";
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(1)} GiB`;
}
/** Pretty-print GB as GB or TB. */
export function formatDisk(gb: number): string {
    if (gb < 1024) return `${gb} GB`;
    return `${(gb / 1024).toFixed(2)} TB`;
}
