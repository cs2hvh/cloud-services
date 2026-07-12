// Compute provider seam.
//
// The compute service supports two provisioning backends:
//   - 'proxmox' — legacy self-managed hosts. Its implementation lives INLINE in
//     the existing routes/libs and stays untouched (dormant until owned
//     hardware returns). It is deliberately NOT adapted to this interface.
//   - 'linode'  — resold Linode instances (lib/services/compute/providers/linode/*).
//
// Routes dispatch per-row on `servers.provider`: getProviderOps() returns the
// Linode ops for linode rows and null for proxmox rows, in which case the
// route falls through to its original inline Proxmox path.

export type ComputeProviderName = "proxmox" | "linode";

/** The subset of a `servers` row that provider ops need. */
export interface ProviderServerRow {
    id: number;
    provider: ComputeProviderName | string | null;
    linode_id: number | null;
    name: string;
    ip: string | null;
    os: string | null;
    location: string | null;
    cpu_cores: number;
    memory_mb: number;
    disk_gb: number;
    status: string;
    plan_slug: string | null;
    owner_id: string | null;
    owner_email: string | null;
    hourly_cost: number | null;
    billing_service_id: string | null;
    details: Record<string, unknown> | null;
}

export type PowerAction = "start" | "stop" | "reboot";

export interface ResizeTarget {
    typeId: string;
    label: string;
    class: string;
    vcpus: number;
    memoryMB: number;
    diskGB: number;
    hourlyUSD: number;
    monthlyUSD: number;
    available: boolean;
}

export interface ConsoleInfo {
    kind: "vnc" | "lish";
    /** Weblish/Glish websocket URLs (lish) or proxy path (vnc). */
    urls: Record<string, string>;
    token?: string;
}

/** Day-2 operations a provider implements (create is a standalone handler). */
export interface ComputeProviderOps {
    power(server: ProviderServerRow, action: PowerAction): Promise<{ status: string }>;
    /** Infra teardown only — billing close + row cleanup stay in destroyServer. */
    destroy(server: ProviderServerRow): Promise<void>;
    resizeTargets(server: ProviderServerRow): Promise<ResizeTarget[]>;
    resize(server: ProviderServerRow, targetTypeId: string): Promise<{ newHourlyRate: number }>;
    getMetrics(server: ProviderServerRow, timeframe: string): Promise<unknown>;
    getConsole(server: ProviderServerRow): Promise<ConsoleInfo>;
    resetPassword(server: ProviderServerRow, rootPass: string): Promise<void>;
    rebuild(
        server: ProviderServerRow,
        opts: { image: string; rootPass: string; authorizedKeys?: string[] }
    ): Promise<void>;
}
