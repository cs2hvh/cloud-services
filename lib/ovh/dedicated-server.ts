// Typed wrappers for OVH /dedicated/server/* endpoints used for
// vMAC automation.
//
// Workflow we automate:
//   1. listFailoverIps()   -> all IPs OVH has assigned to the server
//   2. listVirtualMacs()   -> all vMACs already created on the server
//   3. listVmacAddresses() -> for each vMAC, which IPs are bound
//   4. createVirtualMac()  -> POST returns a task; OVH provisions async
//   5. pollTaskUntilDone() -> wait for status === "done"
//   6. After completion, the new vMAC appears in listVirtualMacs().
//      Diff before vs after to identify it.
//
// Hard limits to respect:
//   - 32 vMACs per dedicated server (OVH-enforced)

import { OvhApiError, OvhCredentials, ovhRequest } from "./client";

export type OvhTaskStatus =
    | "init"
    | "todo"
    | "doing"
    | "done"
    | "cancelled"
    | "ovhError"
    | "customerError";

export type OvhTask = {
    taskId: number;
    status: OvhTaskStatus;
    function: string;
    comment: string | null;
    lastUpdate: string;
    doneDate: string | null;
    todoDate: string;
};

export type OvhVirtualMac = {
    macAddress: string;
    type: "ovh" | "vmware";
    virtualMachineName?: string;
};

export type OvhVmacType = "ovh" | "vmware";

const enc = (s: string) => encodeURIComponent(s);

/** Maximum vMACs OVH allows per dedicated server. */
export const OVH_VMAC_CAP_PER_SERVER = 32;

/**
 * GET /dedicated/server/{serviceName}/ips
 * Returns the full list of IPs (CIDR-style strings) assigned to the
 * server, e.g. ["1.2.3.4/32", "5.6.7.8/32"].
 */
export async function listFailoverIps(
    creds: OvhCredentials,
    serviceName: string
): Promise<string[]> {
    return ovhRequest<string[]>(
        creds,
        "GET",
        `/dedicated/server/${enc(serviceName)}/ips`
    );
}

/**
 * Normalise a CIDR IP like "1.2.3.4/32" to "1.2.3.4". Block IPs
 * with prefixes other than /32 are returned as-is so callers can
 * decide how to handle them (they aren't candidates for vMAC).
 */
export function stripSingleHostMask(ipWithMask: string): string {
    const slash = ipWithMask.indexOf("/");
    if (slash === -1) return ipWithMask;
    const mask = ipWithMask.slice(slash + 1);
    if (mask === "32" || mask === "128") return ipWithMask.slice(0, slash);
    return ipWithMask;
}

/**
 * GET /dedicated/server/{serviceName}/virtualMac
 * Returns the MAC addresses (lowercase strings) that already exist.
 */
export async function listVirtualMacs(
    creds: OvhCredentials,
    serviceName: string
): Promise<string[]> {
    return ovhRequest<string[]>(
        creds,
        "GET",
        `/dedicated/server/${enc(serviceName)}/virtualMac`
    );
}

/**
 * GET /dedicated/server/{serviceName}/virtualMac/{mac}
 * Get metadata for a single vMAC.
 */
export async function getVirtualMac(
    creds: OvhCredentials,
    serviceName: string,
    macAddress: string
): Promise<OvhVirtualMac> {
    return ovhRequest<OvhVirtualMac>(
        creds,
        "GET",
        `/dedicated/server/${enc(serviceName)}/virtualMac/${enc(macAddress)}`
    );
}

/**
 * GET /dedicated/server/{serviceName}/virtualMac/{mac}/virtualAddress
 * Returns the IPs currently bound to that vMAC.
 */
export async function listVmacAddresses(
    creds: OvhCredentials,
    serviceName: string,
    macAddress: string
): Promise<string[]> {
    return ovhRequest<string[]>(
        creds,
        "GET",
        `/dedicated/server/${enc(serviceName)}/virtualMac/${enc(macAddress)}/virtualAddress`
    );
}

/**
 * POST /dedicated/server/{serviceName}/virtualMac
 * Creates a new vMAC, bound to the supplied IP. Returns a task; the
 * vMAC isn't visible in listVirtualMacs() until the task reaches
 * status "done".
 */
export async function createVirtualMac(
    creds: OvhCredentials,
    serviceName: string,
    args: {
        ipAddress: string;
        type: OvhVmacType;
        virtualMachineName: string;
    }
): Promise<OvhTask> {
    return ovhRequest<OvhTask>(
        creds,
        "POST",
        `/dedicated/server/${enc(serviceName)}/virtualMac`,
        args
    );
}

/**
 * DELETE /dedicated/server/{serviceName}/virtualMac/{mac}
 * Removes the vMAC entirely (async — returns a task).
 */
export async function deleteVirtualMac(
    creds: OvhCredentials,
    serviceName: string,
    macAddress: string
): Promise<OvhTask> {
    return ovhRequest<OvhTask>(
        creds,
        "DELETE",
        `/dedicated/server/${enc(serviceName)}/virtualMac/${enc(macAddress)}`
    );
}

/**
 * GET /dedicated/server/{serviceName}/task/{id}
 * Status of a previously-submitted task.
 */
export async function getTask(
    creds: OvhCredentials,
    serviceName: string,
    taskId: number
): Promise<OvhTask> {
    return ovhRequest<OvhTask>(
        creds,
        "GET",
        `/dedicated/server/${enc(serviceName)}/task/${taskId}`
    );
}

/**
 * Poll a task until terminal state. Throws if the task fails or
 * times out. Default timeout is 4 minutes — vMAC provisioning is
 * usually 30-90s, occasionally longer.
 */
export async function pollTaskUntilDone(
    creds: OvhCredentials,
    serviceName: string,
    taskId: number,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<OvhTask> {
    const timeoutMs = opts.timeoutMs ?? 4 * 60 * 1000;
    const pollIntervalMs = opts.pollIntervalMs ?? 4_000;
    const deadline = Date.now() + timeoutMs;

    // First-poll delay — gives OVH a moment to register the task
    await sleep(1_500);

    while (true) {
        let task: OvhTask;
        try {
            task = await getTask(creds, serviceName, taskId);
        } catch (e) {
            // Transient 404 right after task submission is possible —
            // tolerate one or two before failing
            if (e instanceof OvhApiError && e.status === 404 && Date.now() < deadline - 30_000) {
                await sleep(pollIntervalMs);
                continue;
            }
            throw e;
        }

        if (task.status === "done") return task;
        if (
            task.status === "cancelled" ||
            task.status === "ovhError" ||
            task.status === "customerError"
        ) {
            throw new Error(
                `OVH task ${taskId} (${task.function}) ended with status "${task.status}": ${task.comment ?? "no comment"}`
            );
        }

        if (Date.now() > deadline) {
            throw new Error(
                `OVH task ${taskId} (${task.function}) did not complete within ${timeoutMs}ms (last status: ${task.status})`
            );
        }
        await sleep(pollIntervalMs);
    }
}

function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Composite helpers ───────────────────────────────────────────

export type OvhServerVmacReport = {
    failoverIps: string[];        // CIDR strings as-returned by OVH
    failoverIpsClean: string[];   // /32 stripped — these are vMAC candidates
    virtualMacs: string[];
    vmacIpMap: Record<string, string[]>; // macAddress -> [ip, ip, ...]
    boundIps: Set<string>;        // IPs already bound to some vMAC
    unboundIps: string[];         // candidates that have no vMAC yet
    capRemaining: number;         // 32 - virtualMacs.length, clamped >= 0
};

/**
 * Build a full picture of vMAC state for one server in 2 + N calls.
 * Used by the admin "sync vMACs" endpoint to compute deltas before
 * making any mutations.
 */
export async function buildVmacReport(
    creds: OvhCredentials,
    serviceName: string
): Promise<OvhServerVmacReport> {
    const [rawIps, macs] = await Promise.all([
        listFailoverIps(creds, serviceName),
        listVirtualMacs(creds, serviceName),
    ]);

    const failoverIpsClean = rawIps
        .map(stripSingleHostMask)
        .filter((ip) => !ip.includes("/")); // only /32 candidates

    // For each existing vMAC, list its bound IPs (in parallel, low
    // fan-out so OVH rate limits aren't a concern)
    const vmacIpMap: Record<string, string[]> = {};
    await Promise.all(
        macs.map(async (mac) => {
            try {
                vmacIpMap[mac] = await listVmacAddresses(creds, serviceName, mac);
            } catch {
                vmacIpMap[mac] = [];
            }
        })
    );
    const boundIps = new Set<string>(Object.values(vmacIpMap).flat());

    const unboundIps = failoverIpsClean.filter((ip) => !boundIps.has(ip));

    return {
        failoverIps: rawIps,
        failoverIpsClean,
        virtualMacs: macs,
        vmacIpMap,
        boundIps,
        unboundIps,
        capRemaining: Math.max(0, OVH_VMAC_CAP_PER_SERVER - macs.length),
    };
}
