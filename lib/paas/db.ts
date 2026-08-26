/**
 * Control-plane database access for the `paas` schema.
 *
 * A thin PostgREST client rather than a driver, so every module in lib/paas
 * still runs under plain `node --test` with zero dependencies.
 *
 * THIS EXISTS BECAUSE OF A REAL FAILURE. The first version of the provisioning
 * scripts created live Linode resources — an LKE cluster, worker nodes, a
 * NodeBalancer, build VMs — and wrote NOTHING to `paas.clusters` or
 * `paas.build_vms`. The tables were designed precisely so infrastructure cannot
 * outlive its record, and then nothing wrote to them. That is the same shape as
 * the v1 defect that left five billing meters still active for apps that no
 * longer exist.
 *
 * The rule that follows: RECORD BEFORE YOU CREATE. A row with no cloud id is
 * harmless and reapable. A cloud resource with no row is money nobody knows
 * about.
 *
 * Uses the service role, so it is for reconcilers and provisioning scripts
 * ONLY. Anything acting on behalf of a user must go through an RLS-scoped
 * client instead — v1 used the service-role client for 100% of tenant queries
 * and reduced its own RLS to decoration.
 */

const SCHEMA = "paas";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`[paas/db] Missing ${name}`);
  return v.replace(/^"|"$/g, "");
}

function restUrl(): string {
  return `${env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "")}/rest/v1`;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Accept-Profile": SCHEMA,
    "Content-Profile": SCHEMA,
    ...extra,
  };
}

export class DbError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DbError";
    this.status = status;
    this.body = body;
  }
}

async function req<T>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
  const res = await fetch(`${restUrl()}/${path}`, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DbError(`[paas/db] ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`, res.status, text);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const db = {
  select: <T>(table: string, query = "") => req<T[]>("GET", `${table}?${query}`),
  insert: <T>(table: string, row: unknown) =>
    req<T[]>("POST", table, row, "return=representation"),
  update: <T>(table: string, query: string, patch: unknown) =>
    req<T[]>("PATCH", `${table}?${query}`, patch, "return=representation"),
  delete: (table: string, query: string) => req<null>("DELETE", `${table}?${query}`),
  /** Prove the schema is reachable before a script starts creating resources. */
  async reachable(): Promise<boolean> {
    try {
      await req("GET", "clusters?select=ref&limit=1");
      return true;
    } catch {
      return false;
    }
  },
};

// ── clusters ────────────────────────────────────────────────────────────────

export interface ClusterRow {
  id: string;
  ref: string;
  name: string;
  region: string;
  lke_cluster_id: number | null;
  k8s_version: string | null;
  state: "provisioning" | "ready" | "draining" | "retired";
  pod_capacity: number;
  pod_allocated: number;
  accepts_new: boolean;
}

export const clusters = {
  list: () => db.select<ClusterRow>("clusters", "select=*&order=created_at"),

  byLkeId: async (lkeClusterId: number): Promise<ClusterRow | null> =>
    (await db.select<ClusterRow>("clusters", `select=*&lke_cluster_id=eq.${lkeClusterId}`))[0] ?? null,

  /**
   * Record a cluster BEFORE asking Linode to create one. `lke_cluster_id` is
   * filled in afterwards, so a crash between the two leaves a row with no cloud
   * id — visible, harmless, and cleanable — rather than a cluster nobody knows
   * about.
   */
  async reserve(input: { name: string; region: string; podCapacity?: number }): Promise<ClusterRow> {
    const [row] = await db.insert<ClusterRow>("clusters", {
      name: input.name,
      region: input.region,
      state: "provisioning",
      pod_capacity: input.podCapacity ?? 1000,
    });
    return row;
  },

  attach: async (ref: string, lkeClusterId: number, k8sVersion: string) =>
    (await db.update<ClusterRow>("clusters", `ref=eq.${ref}`, {
      lke_cluster_id: lkeClusterId,
      k8s_version: k8sVersion,
    }))[0],

  markReady: async (ref: string) =>
    (await db.update<ClusterRow>("clusters", `ref=eq.${ref}`, { state: "ready" }))[0],

  markRetired: async (ref: string) =>
    (await db.update<ClusterRow>("clusters", `ref=eq.${ref}`, {
      state: "retired",
      accepts_new: false,
    }))[0],
};

// ── build VMs ───────────────────────────────────────────────────────────────

export type BuildVmState = "requested" | "provisioning" | "running" | "releasing" | "destroyed" | "leaked";

export interface BuildVmRow {
  id: string;
  ref: string;
  deployment_id: string | null;
  linode_id: number | null;
  region: string;
  instance_type: string;
  state: BuildVmState;
  expires_at: string;
  destroyed_at: string | null;
  last_error: string | null;
}

export const buildVms = {
  /**
   * Reserve the row BEFORE leasing the instance. `expires_at` is set here, not
   * later: the reaper must be able to bound a VM's life even if every
   * subsequent step fails.
   */
  async reserve(input: {
    region: string;
    instanceType: string;
    expiresAt: Date;
    deploymentId?: string | null;
  }): Promise<BuildVmRow> {
    const [row] = await db.insert<BuildVmRow>("build_vms", {
      region: input.region,
      instance_type: input.instanceType,
      expires_at: input.expiresAt.toISOString(),
      deployment_id: input.deploymentId ?? null,
      state: "requested",
    });
    return row;
  },

  attach: async (ref: string, linodeId: number) =>
    (await db.update<BuildVmRow>("build_vms", `ref=eq.${ref}`, {
      linode_id: linodeId,
      state: "provisioning",
    }))[0],

  setState: async (ref: string, state: BuildVmState, lastError?: string) =>
    (await db.update<BuildVmRow>("build_vms", `ref=eq.${ref}`, {
      state,
      ...(state === "destroyed" ? { destroyed_at: new Date().toISOString() } : {}),
      ...(lastError ? { last_error: lastError.slice(0, 2000) } : {}),
    }))[0],

  /** Rows still claiming a live instance past their deadline. */
  expired: (now = new Date()) =>
    db.select<BuildVmRow>(
      "build_vms",
      `select=*&expires_at=lt.${now.toISOString()}&state=in.(requested,provisioning,running,releasing)`,
    ),

  live: () =>
    db.select<BuildVmRow>(
      "build_vms",
      "select=*&state=in.(requested,provisioning,running,releasing)&order=created_at",
    ),
};
