// Linode API v4 typed interfaces.
// Shapes mirror https://api.linode.com/v4 (techdocs.akamai.com/linode-api) as of 2026-07.
// Only the fields the platform consumes are modeled; unknown fields flow through untyped.

// ─── Errors ──────────────────────────────────────────────────────────────────

export type LinodeErrorCode =
    | "AUTH"
    | "NOT_FOUND"
    | "RATE_LIMIT"
    | "CAPACITY"
    | "INVALID"
    | "SERVER"
    | "TIMEOUT"
    | "UNKNOWN";

export interface LinodeError {
    code: LinodeErrorCode;
    status?: number;
    message: string;
    retryable: boolean;
    /** Verbatim Linode error entries: [{reason, field?}] — surfaced to users on INVALID. */
    reasons?: Array<{ reason: string; field?: string }>;
    raw?: unknown;
}

// ─── Pagination envelope ─────────────────────────────────────────────────────

export interface LinodePage<T> {
    data: T[];
    page: number;
    pages: number;
    results: number;
}

// ─── Catalog resources ───────────────────────────────────────────────────────

export interface LinodeRegion {
    id: string; // 'us-ord'
    label: string; // 'Chicago, IL'
    country: string; // 'us'
    capabilities: string[]; // e.g. ['Linodes','Backups','Disk Encryption',...]
    status: string; // 'ok'
}

export interface LinodeRegionPrice {
    id: string; // region id
    hourly: number;
    monthly: number;
}

export type LinodeTypeClass =
    | "nanode"
    | "standard"
    | "dedicated"
    | "highmem"
    | "gpu"
    | "premium"
    | "accelerated";

export interface LinodeType {
    id: string; // 'g6-standard-2'
    label: string; // 'Linode 4GB'
    class: LinodeTypeClass;
    vcpus: number;
    memory: number; // MB
    disk: number; // MB
    transfer: number; // GB included
    network_out: number; // Mbps
    price: { hourly: number; monthly: number };
    region_prices?: LinodeRegionPrice[];
    addons?: {
        backups?: {
            price?: { hourly: number | null; monthly: number | null };
            region_prices?: LinodeRegionPrice[];
        };
    };
}

export interface LinodeImage {
    id: string; // 'linode/ubuntu24.04'
    label: string;
    vendor: string | null; // 'Ubuntu'
    size: number; // MB
    is_public: boolean;
    deprecated: boolean;
    eol: string | null;
    status?: string;
}

/** One row of GET /regions/availability. */
export interface LinodeRegionAvailability {
    region: string;
    plan: string; // type id
    available: boolean;
}

// ─── Instances ───────────────────────────────────────────────────────────────

export type LinodeInstanceStatus =
    | "provisioning"
    | "booting"
    | "running"
    | "offline"
    | "shutting_down"
    | "rebooting"
    | "rebuilding"
    | "resizing"
    | "restoring"
    | "migrating"
    | "cloning"
    | "stopped";

export interface LinodeInstance {
    id: number;
    label: string;
    region: string;
    type: string; // type id
    image: string | null;
    status: LinodeInstanceStatus;
    ipv4: string[];
    ipv6: string | null; // '2600:.../128'
    specs: { vcpus: number; memory: number; disk: number; transfer: number };
    backups?: { enabled: boolean };
    tags: string[];
    created: string;
    updated: string;
}

export interface LinodeCreateInstanceRequest {
    region: string;
    type: string;
    image: string;
    label: string;
    root_pass: string;
    authorized_keys?: string[];
    backups_enabled?: boolean;
    disk_encryption?: "enabled" | "disabled";
    tags?: string[];
    private_ip?: boolean;
    metadata?: { user_data: string };
    firewall_id?: number;
}

// ─── Backups ─────────────────────────────────────────────────────────────────

export interface LinodeBackup {
    id: number;
    label: string | null;
    status: string; // 'successful' | 'pending' | ...
    type: "auto" | "snapshot";
    created: string;
    finished: string | null;
    disks: Array<{ label: string; size: number; filesystem: string }>;
}

export interface LinodeBackupsResponse {
    automatic: LinodeBackup[];
    snapshot: { current: LinodeBackup | null; in_progress: LinodeBackup | null };
}

// ─── Stats (24h; 5-minute granularity; no memory metric) ─────────────────────

export type LinodeStatSeries = Array<[number, number]>; // [epoch_ms, value]

export interface LinodeInstanceStats {
    title?: string;
    data: {
        cpu: LinodeStatSeries; // percent
        io: { io: LinodeStatSeries; swap: LinodeStatSeries };
        netv4: { in: LinodeStatSeries; out: LinodeStatSeries; private_in: LinodeStatSeries; private_out: LinodeStatSeries };
        netv6: { in: LinodeStatSeries; out: LinodeStatSeries; private_in: LinodeStatSeries; private_out: LinodeStatSeries };
    };
}

// ─── Console (Lish) ──────────────────────────────────────────────────────────

/** POST /linode/instances/{id}/lish — websocket auth for weblish/glish. */
export interface LinodeLishResponse {
    weblish_url?: string;
    glish_url?: string;
    monitor_url?: string;
    token?: string;
    [key: string]: unknown;
}

// ─── Account (token status probe) ────────────────────────────────────────────

export interface LinodeAccount {
    email: string;
    company?: string;
    euuid?: string;
}
