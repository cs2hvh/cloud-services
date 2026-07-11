// Typed Pterodactyl client — Application API (admin provisioning) + Client API
// (power/console/stats). Replaces the old bare axios instance. All panel access
// in the platform goes through here so a future Pelican migration is contained.
//
// Env:
//   PTERO_DOMAIN      panel base URL, e.g. https://games.ahurasense.com
//   PTERO_API_KEY     Application API key (ptla_...) — server-side only
//   PTERO_CLIENT_KEY  Client API key (ptlc_...) — for power/console/stats

const BASE = (process.env.PTERO_DOMAIN || "").replace(/\/$/, "");
const APP_KEY = process.env.PTERO_API_KEY || "";
const CLIENT_KEY = process.env.PTERO_CLIENT_KEY || "";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

export type PterodactylErrorCode =
  | "not_configured"
  | "unauthorized"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "server"
  | "network"
  | "timeout"
  | "unknown";

export class PterodactylError extends Error {
  code: PterodactylErrorCode;
  status: number;
  detail?: string;
  constructor(params: { code: PterodactylErrorCode; message: string; status?: number; detail?: string }) {
    super(params.message);
    this.name = "PterodactylError";
    this.code = params.code;
    this.status = params.status ?? 0;
    this.detail = params.detail;
  }
}

function statusToCode(status: number): PterodactylErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "unknown";
}

const isRetryable = (code: PterodactylErrorCode) =>
  code === "rate_limited" || code === "server" || code === "network" || code === "timeout";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  api: "application" | "client",
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!BASE) throw new PterodactylError({ code: "not_configured", message: "PTERO_DOMAIN is not set" });
  const key = api === "application" ? APP_KEY : CLIENT_KEY;
  if (!key) {
    throw new PterodactylError({
      code: "not_configured",
      message: `${api === "application" ? "PTERO_API_KEY" : "PTERO_CLIENT_KEY"} is not set`,
    });
  }

  const url = `${BASE}/api/${api}${path}`;
  let lastErr: PterodactylError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);

      if (res.status === 204) return undefined as T;

      const text = await res.text();
      const data = text ? safeJson(text) : null;

      if (!res.ok) {
        const code = statusToCode(res.status);
        const detail = extractError(data) || text.slice(0, 300);
        lastErr = new PterodactylError({
          code,
          status: res.status,
          message: `Pterodactyl ${api} ${method} ${path} → ${res.status}`,
          detail,
        });
        if (isRetryable(code) && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get("retry-after")) || 0;
          await sleep(retryAfter ? retryAfter * 1000 : 400 * 2 ** attempt);
          continue;
        }
        throw lastErr;
      }

      return (data as T) ?? (undefined as T);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof PterodactylError) {
        if (isRetryable(err.code) && attempt < MAX_RETRIES) continue;
        throw err;
      }
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastErr = new PterodactylError({
        code: isAbort ? "timeout" : "network",
        message: isAbort ? `Pterodactyl request timed out: ${path}` : `Pterodactyl request failed: ${path}`,
        detail: err instanceof Error ? err.message : String(err),
      });
      if (attempt < MAX_RETRIES) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new PterodactylError({ code: "unknown", message: `Pterodactyl request failed: ${path}` });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractError(data: unknown): string | undefined {
  const errs = (data as { errors?: Array<{ detail?: string; code?: string }> } | null)?.errors;
  if (Array.isArray(errs) && errs.length) return errs.map((e) => e.detail || e.code).filter(Boolean).join("; ");
  return undefined;
}

// ── Types (only what the platform consumes) ─────────────────────────────────
export interface PteroUser {
  id: number;
  uuid: string;
  username: string;
  email: string;
  root_admin: boolean;
}
export interface PteroServer {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  suspended: boolean;
  node: number;
  status: string | null;
}
export interface PteroAllocation {
  id: number;
  ip: string;
  port: number;
  assigned: boolean;
  alias: string | null;
}
export interface PteroLocation {
  id: number;
  short: string;
  long: string | null;
}
export interface PteroNode {
  id: number;
  name: string;
  location_id: number;
  fqdn: string;
  scheme: string;
  memory: number;
  disk: number;
}
export interface CreateNodeInput {
  name: string;
  location_id: number;
  fqdn: string;
  scheme: "https" | "http";
  memory: number;
  memory_overallocate: number;
  disk: number;
  disk_overallocate: number;
  upload_size?: number;
  daemon_sftp?: number;
  daemon_listen?: number;
}
export interface CreateServerInput {
  name: string;
  user: number;
  egg: number;
  docker_image: string;
  startup: string;
  environment: Record<string, string>;
  limits: { memory: number; swap: number; disk: number; io: number; cpu: number };
  feature_limits: { databases: number; allocations: number; backups: number };
  allocation: { default: number; additional?: number[] };
  start_on_completion?: boolean;
  external_id?: string;
}

type Item<T> = { attributes: T };
type List<T> = { data: Array<Item<T>>; meta?: { pagination?: { total: number; current_page: number; total_pages: number } } };

function randomPassword(len = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  const g = globalThis.crypto;
  const buf = new Uint32Array(len);
  g.getRandomValues(buf);
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}

export const pterodactyl = {
  isConfigured(): boolean {
    return Boolean(BASE && APP_KEY);
  },

  panelUrl(): string {
    return BASE;
  },

  // ── Application: users ────────────────────────────────────────────────────
  async findUserByEmail(email: string): Promise<PteroUser | null> {
    const res = await request<List<PteroUser>>(
      "application",
      "GET",
      `/users?filter[email]=${encodeURIComponent(email)}`,
    );
    const match = res.data?.find((u) => u.attributes.email.toLowerCase() === email.toLowerCase());
    return match?.attributes ?? null;
  },

  /** Return the existing panel user for this email, or create one. Returns the
   *  user plus the generated password when newly created (null if pre-existing). */
  async ensureUser(params: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
  }): Promise<{ user: PteroUser; password: string | null }> {
    const existing = await this.findUserByEmail(params.email);
    if (existing) return { user: existing, password: null };
    const password = randomPassword();
    const created = await request<Item<PteroUser>>("application", "POST", "/users", {
      email: params.email,
      username: params.username,
      first_name: params.firstName,
      last_name: params.lastName,
      password,
    });
    return { user: created.attributes, password };
  },

  /** Force a new random password onto a panel user (for "reset panel password"). */
  async resetUserPassword(userId: number, user: { email: string; username: string; first_name: string; last_name: string }): Promise<string> {
    const password = randomPassword();
    await request("application", "PATCH", `/users/${userId}`, {
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      password,
    });
    return password;
  },

  // ── Application: servers ──────────────────────────────────────────────────
  async createServer(input: CreateServerInput): Promise<PteroServer> {
    const res = await request<Item<PteroServer>>("application", "POST", "/servers", input);
    return res.attributes;
  },
  async getServer(id: number): Promise<PteroServer> {
    const res = await request<Item<PteroServer>>("application", "GET", `/servers/${id}`);
    return res.attributes;
  },
  async suspendServer(id: number): Promise<void> {
    await request("application", "POST", `/servers/${id}/suspend`);
  },
  async unsuspendServer(id: number): Promise<void> {
    await request("application", "POST", `/servers/${id}/unsuspend`);
  },
  async deleteServer(id: number, force = false): Promise<void> {
    await request("application", "DELETE", `/servers/${id}${force ? "/force" : ""}`);
  },
  async reinstallServer(id: number): Promise<void> {
    await request("application", "POST", `/servers/${id}/reinstall`);
  },
  /** Update a server's resource limits + allocations (plan change / resize). */
  async updateServerBuild(
    id: number,
    build: {
      allocation: number;
      memory: number;
      swap: number;
      disk: number;
      io: number;
      cpu: number;
      feature_limits: { databases: number; allocations: number; backups: number };
      add_allocations?: number[];
      remove_allocations?: number[];
    },
  ): Promise<PteroServer> {
    const res = await request<Item<PteroServer>>("application", "PATCH", `/servers/${id}/build`, build);
    return res.attributes;
  },
  /** Update a server's startup egg/image/env (used when changing the docker image or env). */
  async updateServerStartup(
    id: number,
    startup: { startup: string; egg: number; image: string; environment: Record<string, string>; skip_scripts?: boolean },
  ): Promise<PteroServer> {
    const res = await request<Item<PteroServer>>("application", "PATCH", `/servers/${id}/startup`, startup);
    return res.attributes;
  },

  // ── Application: locations / nodes / allocations (onboarding) ─────────────
  async findLocationByShort(short: string): Promise<PteroLocation | null> {
    const res = await request<List<PteroLocation>>("application", "GET", `/locations`);
    return res.data?.find((l) => l.attributes.short === short)?.attributes ?? null;
  },
  async createLocation(short: string, long: string): Promise<PteroLocation> {
    const res = await request<Item<PteroLocation>>("application", "POST", "/locations", { short, long });
    return res.attributes;
  },
  async findNodeByFqdn(fqdn: string): Promise<PteroNode | null> {
    let page = 1;
    for (;;) {
      const res = await request<List<PteroNode>>("application", "GET", `/nodes?per_page=100&page=${page}`);
      const match = res.data?.find((n) => n.attributes.fqdn === fqdn)?.attributes;
      if (match) return match;
      const pg = res.meta?.pagination;
      if (!pg || pg.current_page >= pg.total_pages) return null;
      page++;
    }
  },
  async createNode(input: CreateNodeInput): Promise<PteroNode> {
    const res = await request<Item<PteroNode>>("application", "POST", "/nodes", input);
    return res.attributes;
  },
  async getNodeConfiguration(nodeId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("application", "GET", `/nodes/${nodeId}/configuration`);
  },
  async createAllocations(nodeId: number, ip: string, ports: string[]): Promise<number> {
    let created = 0;
    for (let i = 0; i < ports.length; i += 100) {
      const chunk = ports.slice(i, i + 100);
      try {
        await request("application", "POST", `/nodes/${nodeId}/allocations`, { ip, ports: chunk });
        created += chunk.length;
      } catch (e) {
        console.warn("[pterodactyl] allocation chunk failed:", e instanceof Error ? e.message : e);
      }
    }
    return created;
  },

  // ── Application: allocations (for placement) ──────────────────────────────
  async listFreeAllocations(nodeId: number, limit = 400): Promise<PteroAllocation[]> {
    const free: PteroAllocation[] = [];
    let page = 1;
    for (;;) {
      const res = await request<List<PteroAllocation>>(
        "application",
        "GET",
        `/nodes/${nodeId}/allocations?per_page=100&page=${page}`,
      );
      for (const a of res.data) if (!a.attributes.assigned) free.push(a.attributes);
      const pg = res.meta?.pagination;
      if (free.length >= limit || !pg || pg.current_page >= pg.total_pages) break;
      page++;
    }
    return free;
  },

  // ── Client: power / stats ─────────────────────────────────────────────────
  async power(identifier: string, signal: "start" | "stop" | "restart" | "kill"): Promise<void> {
    await request("client", "POST", `/servers/${identifier}/power`, { signal });
  },
  async resources(identifier: string): Promise<{ current_state: string; resources: Record<string, number> }> {
    const res = await request<Item<{ current_state: string; resources: Record<string, number> }>>(
      "client",
      "GET",
      `/servers/${identifier}/resources`,
    );
    return res.attributes;
  },
  async sendCommand(identifier: string, command: string): Promise<void> {
    await request("client", "POST", `/servers/${identifier}/command`, { command });
  },

  /** Write a file into the server's volume via the Client API (e.g. eula.txt). */
  async writeFile(identifier: string, filePath: string, content: string): Promise<void> {
    if (!BASE || !CLIENT_KEY) {
      throw new PterodactylError({ code: "not_configured", message: "PTERO_CLIENT_KEY is not set" });
    }
    const res = await fetch(
      `${BASE}/api/client/servers/${identifier}/files/write?file=${encodeURIComponent(filePath)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLIENT_KEY}`,
          Accept: "application/json",
          "Content-Type": "text/plain",
        },
        body: content,
        cache: "no-store",
      },
    );
    if (!res.ok && res.status !== 204) {
      throw new PterodactylError({
        code: statusToCode(res.status),
        status: res.status,
        message: `Pterodactyl file write failed (${res.status})`,
      });
    }
  },
};
