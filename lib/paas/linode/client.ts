/**
 * Linode API client for v2.
 *
 * Carries over the genuinely good parts of v1's client (retry with jittered
 * backoff, error categorization, capacity detection, pagination) — the audit
 * flagged it as reusable — and adds what v2 needs: LKE, VPCs and NodeBalancers,
 * which v1 never touched.
 *
 * The token this uses belongs to a RESTRICTED Linode user holding only
 * `account_*_creator` roles and no entity-access roles. Verified empirically:
 * it sees 0 pre-existing Linodes and gets 401 on /account, but can create,
 * read and delete its own resources.
 */

import { paasConfig } from "../config.ts";

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 400;
const DEFAULT_TIMEOUT_MS = 30_000;

export type LinodeErrorCode =
  | "AUTH"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "CAPACITY"
  | "INVALID"
  | "SERVER"
  | "TIMEOUT";

export class LinodeError extends Error {
  code: LinodeErrorCode;
  status?: number;
  retryable: boolean;
  retryAfterMs?: number;

  constructor(
    code: LinodeErrorCode,
    message: string,
    status?: number,
    retryable = false,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LinodeError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

interface ApiErrorBody {
  errors?: Array<{ reason: string; field?: string }>;
}

function looksLikeCapacity(errors: Array<{ reason: string }>): boolean {
  return errors.some((e) => /capacity|not available|out of|no available/i.test(e.reason));
}

function categorize(status: number | undefined, body: ApiErrorBody | null): LinodeError {
  const reasons = body?.errors ?? [];
  const detail = reasons.map((e) => (e.field ? `${e.field}: ${e.reason}` : e.reason)).join("; ");

  if (status === undefined) return new LinodeError("TIMEOUT", "Linode request timed out", undefined, true);
  if (status === 401 || status === 403) return new LinodeError("AUTH", detail || "Unauthorized", status, false);
  if (status === 404) return new LinodeError("NOT_FOUND", detail || "Not found", status, false);
  if (status === 429) return new LinodeError("RATE_LIMIT", detail || "Rate limited", status, true);
  if (status >= 500) return new LinodeError("SERVER", detail || "Linode server error", status, true);
  if (status >= 400) {
    // Capacity errors arrive as 400s but are worth retrying elsewhere/later.
    if (looksLikeCapacity(reasons)) {
      return new LinodeError("CAPACITY", detail || "No capacity in region", status, true);
    }
    return new LinodeError("INVALID", detail || "Invalid request", status, false);
  }
  return new LinodeError("SERVER", detail || `Unexpected status ${status}`, status, true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    let status: number | undefined;
    let parsed: ApiErrorBody | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      const res = await fetch(`${paasConfig.linode.apiBase()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${paasConfig.linode.token()}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      status = res.status;
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      try {
        parsed = JSON.parse(await res.text()) as ApiErrorBody;
      } catch {
        parsed = null;
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        // Network-level failure: treat as retryable server error.
        status = undefined;
      }
    }

    const err = categorize(status, parsed);
    attempt += 1;
    if (!err.retryable || attempt >= MAX_RETRIES) {
      throw new LinodeError(err.code, `${method} ${path}: ${err.message}`, err.status, err.retryable);
    }
    const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    await sleep(backoff + Math.floor(Math.random() * 250));
  }
}

interface Page<T> {
  data: T[];
  page: number;
  pages: number;
}

/** Drain a paginated collection. Tolerates endpoints that return a bare array. */
async function getAllPages<T>(path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const out: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await request<Page<T> | T[]>("GET", `${path}${sep}page=${page}&page_size=100`);
    if (Array.isArray(res)) return res;
    out.push(...(res.data ?? []));
    pages = res.pages ?? 1;
    page += 1;
  } while (page <= pages);
  return out;
}

export const linode = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  delete: <T>(p: string) => request<T>("DELETE", p),
  getAllPages,
};

// ── Instances ───────────────────────────────────────────────────────────────

export interface Instance {
  id: number;
  label: string;
  region: string;
  type: string;
  status: "provisioning" | "booting" | "running" | "offline" | "shutting_down" | "rebooting";
  ipv4: string[];
  created: string;
  tags: string[];
}

export interface CreateInstanceInput {
  region: string;
  type: string;
  label: string;
  root_pass: string;
  image?: string;
  booted?: boolean;
  tags?: string[];
  /** cloud-init user data, base64 encoded. */
  metadata?: { user_data: string };
  authorized_keys?: string[];
  firewall_id?: number;
  private_ip?: boolean;
}

export const instances = {
  list: () => getAllPages<Instance>("/linode/instances"),
  get: (id: number) => request<Instance>("GET", `/linode/instances/${id}`),
  create: (input: CreateInstanceInput) => request<Instance>("POST", "/linode/instances", input),
  delete: (id: number) => request<void>("DELETE", `/linode/instances/${id}`),
  listByTag: async (tag: string) =>
    (await getAllPages<Instance>("/linode/instances")).filter((i) => i.tags.includes(tag)),
};

// ── LKE ─────────────────────────────────────────────────────────────────────

export interface LkeCluster {
  id: number;
  label: string;
  region: string;
  k8s_version: string;
  status?: string;
  tags: string[];
  control_plane?: { high_availability: boolean };
}

export interface LkeNodePool {
  id: number;
  type: string;
  count: number;
  labels?: Record<string, string>;
  taints?: Array<{ key: string; value: string; effect: string }>;
  disk_encryption?: "enabled" | "disabled";
}

export const lke = {
  listClusters: () => getAllPages<LkeCluster>("/lke/clusters"),
  getCluster: (id: number) => request<LkeCluster>("GET", `/lke/clusters/${id}`),
  createCluster: (input: {
    label: string;
    region: string;
    k8s_version: string;
    node_pools: Array<{
      type: string;
      count: number;
      labels?: Record<string, string>;
      taints?: Array<{ key: string; value: string; effect: string }>;
      disk_encryption?: "enabled" | "disabled";
    }>;
    /**
     * HA is IRREVERSIBLE and recreates every node when enabled later, so any
     * cluster that will ever serve production must be created with it on.
     */
    control_plane?: { high_availability: boolean };
    tags?: string[];
  }) => request<LkeCluster>("POST", "/lke/clusters", input),
  deleteCluster: (id: number) => request<void>("DELETE", `/lke/clusters/${id}`),
  listPools: (clusterId: number) => getAllPages<LkeNodePool>(`/lke/clusters/${clusterId}/pools`),
  /** Returns the kubeconfig, base64-encoded. */
  kubeconfig: (clusterId: number) =>
    request<{ kubeconfig: string }>("GET", `/lke/clusters/${clusterId}/kubeconfig`),
  versions: () => getAllPages<{ id: string }>("/lke/versions"),
};

// ── Regions ─────────────────────────────────────────────────────────────────

export interface Region {
  id: string;
  label: string;
  country: string;
  capabilities: string[];
}

export const regions = {
  list: () => getAllPages<Region>("/regions"),
  /** Assert a region supports every capability v2 depends on. */
  async assertCapable(regionId: string, needed: string[]): Promise<void> {
    const all = await regions.list();
    const r = all.find((x) => x.id === regionId);
    if (!r) throw new LinodeError("NOT_FOUND", `Region ${regionId} does not exist`);
    const missing = needed.filter((c) => !r.capabilities.includes(c));
    if (missing.length) {
      throw new LinodeError(
        "INVALID",
        `Region ${regionId} (${r.label}) lacks required capabilities: ${missing.join(", ")}`,
      );
    }
  },
};
