/**
 * The I/O half of fleet reconciliation: read Linode, read the control plane,
 * hand both to the pure classifier in `./reconcile.ts`.
 *
 * Split from the classifier deliberately. Everything here needs credentials
 * and a network; nothing here makes a judgement. That boundary is what lets
 * the judgements be tested without either.
 *
 * READ-ONLY, BY CONSTRUCTION. Every call in this file is a GET. Reconciliation
 * runs unattended and on a schedule, and a reconciler that can write is a
 * reconciler that can delete a cluster because a listing was briefly empty.
 * `scripts/v2/teardown.ts --apply` is the only thing that destroys anything.
 */

import { instances, linode, lke } from "../linode/client.ts";
import type {
  BuildVmRecord,
  ClusterRecord,
  Pricing,
  RawInstance,
  RawLkeCluster,
  RawNodeBalancer,
} from "./reconcile.ts";

/**
 * Linode's published NodeBalancer price, used when the API does not expose a
 * types endpoint for them. Matches the constant in scripts/v2/teardown.ts.
 */
const NODEBALANCER_HOURLY_FALLBACK = 0.015;

/** LKE HA control plane: $60/month. Standard control plane is free. */
const LKE_HA_MONTHLY = 60;
const MONTH_HOURS = 730;

export interface CloudInventory {
  lkeClusters: RawLkeCluster[];
  instances: RawInstance[];
  nodeBalancers: RawNodeBalancer[];
  pricing: Pricing;
  /** True when the NodeBalancer price came from the published fallback. */
  nodeBalancerPriceIsFallback: boolean;
}

interface LinodeType {
  id: string;
  price: { hourly: number; monthly: number | null };
}

interface RawNbResponse {
  id: number;
  label: string;
  lke_cluster?: { id: number } | null;
}

export async function loadCloudInventory(): Promise<CloudInventory> {
  const [types, clusters, allInstances, nbs] = await Promise.all([
    linode.getAllPages<LinodeType>("/linode/types"),
    lke.listClusters(),
    instances.list(),
    linode.getAllPages<RawNbResponse>("/nodebalancers"),
  ]);

  // A type that is missing from this map is priced as UNKNOWN, never as zero
  // — see the Pricing docblock in ./reconcile.ts.
  const hourlyByType = new Map(types.map((t) => [t.id, t.price.hourly]));

  let nodeBalancerHourly = NODEBALANCER_HOURLY_FALLBACK;
  let nodeBalancerPriceIsFallback = true;
  try {
    const nbTypes = await linode.getAllPages<LinodeType>("/nodebalancers/types");
    const standard = nbTypes[0]?.price?.hourly;
    if (typeof standard === "number") {
      nodeBalancerHourly = standard;
      nodeBalancerPriceIsFallback = false;
    }
  } catch {
    // Older API versions have no /nodebalancers/types. The published price is
    // stable and the fallback is reported, so the number is never silently
    // guessed — the report says which source it used.
  }

  return {
    lkeClusters: clusters.map((c) => ({
      id: c.id,
      label: c.label,
      region: c.region,
      k8s_version: c.k8s_version,
      tags: c.tags ?? [],
      ha: c.control_plane?.high_availability === true,
    })),
    instances: allInstances.map((i) => ({
      id: i.id,
      label: i.label,
      region: i.region,
      type: i.type,
      status: i.status,
      tags: i.tags ?? [],
    })),
    nodeBalancers: nbs.map((nb) => ({
      id: nb.id,
      label: nb.label,
      lkeClusterId: nb.lke_cluster?.id ?? null,
    })),
    pricing: {
      instanceHourly: (t) => hourlyByType.get(t),
      nodeBalancerHourly,
      lkeHaHourly: LKE_HA_MONTHLY / MONTH_HOURS,
    },
    nodeBalancerPriceIsFallback,
  };
}

// ── control plane ───────────────────────────────────────────────────────────
//
// TEMPORARY SEAM. `lib/paas/db.ts` is the real accessor for these tables and
// carries the RECORD-BEFORE-YOU-CREATE contract this module verifies, but it
// is uncommitted work on another branch and does not exist on feat/deploy-v2.
// Rather than block, this reads the same two tables with the same service-role
// PostgREST call, restricted to GET. When db.ts lands, delete everything below
// and call `clusters.list()` / `buildVms.live()` instead — the row shapes are
// already identical, so nothing above this line changes.
//
// Service role is correct HERE and only here: paas.clusters and paas.build_vms
// have RLS enabled with no policy, so they are reachable no other way, and
// reconciliation acts for the platform rather than for any user. Nothing that
// acts on behalf of a user may use this path.

const SCHEMA = "paas";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`[paas/telemetry] Missing ${name}`);
  return v.replace(/^"|"$/g, "");
}

async function selectAll<T>(table: string, query: string): Promise<T[]> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const base = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": SCHEMA,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[paas/telemetry] GET ${table} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : []) as T[];
}

export interface ControlPlaneFleet {
  clusterRows: ClusterRecord[];
  buildVmRows: BuildVmRecord[];
}

export async function loadControlPlane(): Promise<ControlPlaneFleet> {
  const [clusterRows, buildVmRows] = await Promise.all([
    selectAll<ClusterRecord>(
      "clusters",
      "select=ref,name,region,lke_cluster_id,k8s_version,state,created_at&order=created_at",
    ),
    // Every row, including destroyed ones: a row claiming 'destroyed' while
    // the instance still runs is the most expensive finding this tool makes,
    // and filtering to live states would hide exactly that case.
    selectAll<BuildVmRecord>(
      "build_vms",
      "select=ref,linode_id,region,instance_type,state,expires_at,destroyed_at,created_at&order=created_at",
    ),
  ]);
  return { clusterRows, buildVmRows };
}
