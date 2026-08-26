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

import { db } from "../db.ts";
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
// Reads go through lib/paas/db.ts, which is the accessor carrying the
// RECORD-BEFORE-YOU-CREATE contract this module exists to verify. Service role
// is correct HERE and only here: paas.clusters and paas.build_vms have RLS
// enabled with no policy, so they are reachable no other way, and
// reconciliation acts for the platform rather than for any user. Nothing that
// acts on behalf of a user may take this path.

export interface ControlPlaneFleet {
  clusterRows: ClusterRecord[];
  buildVmRows: BuildVmRecord[];
}

/**
 * Refuse to report on a control plane that cannot be read.
 *
 * Borrowed from provision-cluster.ts, which will not provision if the schema
 * is unreachable. The reasoning is the same in reverse: a reconciler that
 * cannot see the records would report every live resource as unrecorded and
 * every row as missing. Reporting catastrophic false drift is worse than
 * reporting nothing, because someone might act on it.
 */
export async function assertControlPlaneReachable(): Promise<void> {
  if (!(await db.reachable())) {
    throw new Error(
      "[paas/telemetry] paas schema unreachable — refusing to reconcile. " +
        "Every resource would report as unrecorded and every row as missing.",
    );
  }
}

export async function loadControlPlane(): Promise<ControlPlaneFleet> {
  const [clusterRows, buildVmRows] = await Promise.all([
    db.select<ClusterRecord>(
      "clusters",
      "select=ref,name,region,lke_cluster_id,k8s_version,state,created_at&order=created_at",
    ),
    // EVERY row, including destroyed ones — deliberately not buildVms.live().
    // A row saying 'destroyed' while the instance is still running is the most
    // expensive finding this tool makes: the teardown path reported a success
    // it did not achieve, and the money is still flowing. Filtering to live
    // states hides exactly that case, and makes the instance look merely
    // unrecorded rather than actively denied.
    db.select<BuildVmRecord>(
      "build_vms",
      "select=ref,linode_id,region,instance_type,state,expires_at,destroyed_at,created_at&order=created_at",
    ),
  ]);
  return { clusterRows, buildVmRows };
}
