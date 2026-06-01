// Pick the best Proxmox storage to provision a new VM disk on.
//
// Why a separate module: capacity.ts runs once at host registration
// and probes everything (CPU/RAM/all storages/main IP). This runs on
// every VM-create call and only needs the live storage status — so
// it's a lean two-request flow (login + storage list).
//
// Policy: pick the storage with the most free space among the ones
// that:
//   - are enabled + active
//   - accept VM disk content (content includes "images" or "rootdir")
//   - have enough free space for the requested disk
//
// If the operator supplied an explicit storage name (e.g. via the
// admin VM-create endpoint's body.storage), it's honored as-is and
// the picker isn't called. The picker is the fallback when the
// dashboard hands us a request without a storage preference.

import { Agent as UndiciAgent } from "undici";

const BYTES_PER_GB = 1024 * 1024 * 1024;

export type ProxmoxStorageRow = {
    name: string;
    type: string;
    content: string;
    active: boolean;
    enabled: boolean;
    totalGB: number;
    usedGB: number;
    availGB: number;
    storesVmDisks: boolean;
};

export type PickArgs = {
    hostUrl: string;
    username: string;
    password: string;
    node: string;
    requiredGB: number;
    allowInsecure?: boolean;
    /** Fallback storage name if the API call fails or no storage fits. */
    fallback?: string;
};

export type PickResult = {
    storage: string;
    chosenFrom: ProxmoxStorageRow[];
    reason: "best-fit" | "fallback-api-failure" | "fallback-no-fit";
};

/**
 * Resolve which storage a VM disk should be provisioned on.
 *
 * Never throws. Returns `{ storage: <fallback>, reason: ... }` if
 * the Proxmox query fails or nothing fits — the caller can decide
 * whether that's acceptable or to surface an error.
 */
export async function pickBestStorage(args: PickArgs): Promise<PickResult> {
    const fallback = args.fallback || "local";

    let storages: ProxmoxStorageRow[];
    try {
        storages = await listStoragesViaApi(args);
    } catch (e) {
        console.warn(
            `[pickBestStorage] Proxmox API query failed (${e instanceof Error ? e.message : e}) — falling back to "${fallback}"`
        );
        return { storage: fallback, chosenFrom: [], reason: "fallback-api-failure" };
    }

    const candidates = storages
        .filter((s) => s.enabled && s.active && s.storesVmDisks && s.availGB >= args.requiredGB)
        .sort((a, b) => b.availGB - a.availGB);

    if (candidates.length === 0) {
        return { storage: fallback, chosenFrom: storages, reason: "fallback-no-fit" };
    }
    return { storage: candidates[0].name, chosenFrom: candidates, reason: "best-fit" };
}

async function listStoragesViaApi(args: PickArgs): Promise<ProxmoxStorageRow[]> {
    const apiBase = normalizeApiBase(args.hostUrl);
    const dispatcher = args.allowInsecure
        ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
        : undefined;

    const ticket = await login(apiBase, args.username, args.password, dispatcher);
    const init: RequestInit & { dispatcher?: UndiciAgent } = {
        headers: { Cookie: `PVEAuthCookie=${ticket}` },
    };
    if (dispatcher) init.dispatcher = dispatcher;

    const res = await fetch(
        `${apiBase}/api2/json/nodes/${encodeURIComponent(args.node)}/storage`,
        init as RequestInit
    );
    if (!res.ok) throw new Error(`/nodes/<node>/storage returned ${res.status}`);
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
        return {
            name: s.storage,
            type: s.type,
            content,
            active: Number(s.active) === 1,
            enabled: Number(s.enabled) === 1,
            totalGB: bytesToGB(s.total),
            usedGB: bytesToGB(s.used),
            availGB: bytesToGB(s.avail),
            storesVmDisks: /\b(images|rootdir)\b/.test(content),
        };
    });
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
    const t = j?.data?.ticket;
    if (!t) throw new Error("Proxmox login returned no ticket");
    return t;
}

function bytesToGB(b?: number): number {
    if (!b || b < 0) return 0;
    return Math.floor(b / BYTES_PER_GB);
}
