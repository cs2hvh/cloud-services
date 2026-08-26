/**
 * Sweep every drift source and record what is open, so duration becomes
 * measurable.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/drift-sweep.ts           # report
 *   node --env-file=.env --env-file=.env.local scripts/v3/drift-sweep.ts --record  # write history
 *
 * This is the one script in scripts/v3 that WRITES. It writes to exactly one
 * place — `paas.drift_observations`, an append-only observation log — and
 * touches no infrastructure and no control-plane state. It cannot create,
 * modify or destroy a resource, and it cannot change what any other system
 * believes about one.
 *
 * Report-by-default anyway, matching teardown.ts and reconcile.ts. A history
 * table is cheap to write and annoying to unwrite, and someone should be able
 * to see what a sweep would record before it records it.
 *
 * Intended for a scheduler. record_drift does not reset observed_at on
 * something already open, so running this every five minutes measures how long
 * drift lasted rather than restarting the clock each time.
 */

import { db } from "../../lib/paas/db.ts";
import { paasConfig } from "../../lib/paas/config.ts";
import { listObjects } from "../../lib/paas/build/r2.ts";
import { listDnsRecords } from "../../lib/paas/edge/cloudflare.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { assertControlPlaneReachable, loadCloudInventory, loadControlPlane } from "../../lib/paas/telemetry/fleet-source.ts";
import { reconcile } from "../../lib/paas/telemetry/reconcile.ts";
import { ingressHosts, reconcileHostnames, type AliasLike } from "../../lib/paas/telemetry/dns-drift.ts";
import { reconcileR2, type DeploymentLike } from "../../lib/paas/telemetry/r2-drift.ts";
import {
  FLEET_SCOPE,
  HOSTNAME_SCOPE,
  R2_SCOPE,
  UNMAPPED,
  groupForResolve,
  observationsFromFleet,
  observationsFromHostnames,
  observationsFromR2,
  type Observation,
  type SweepScope,
} from "../../lib/paas/telemetry/drift-history.ts";

const RECORD = process.argv.includes("--record");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

/**
 * PostgREST RPC, now `db.rpc`.
 *
 * This file inlined its own until a second caller appeared — the
 * infrastructure lane needed one for an enum-mirror test and promoted it,
 * which is exactly the trigger the inline copy's comment named. One
 * implementation, no behaviour change.
 */
const rpc = db.rpc;

await assertControlPlaneReachable();

// ── --history: read back what is open and how long it has been ──────────────
//
// The whole reason for storing observations. A report says what is wrong now;
// this says what has been wrong since Tuesday, which is a different and more
// useful sentence.

if (process.argv.includes("--history")) {
  interface Row {
    kind: string;
    resource_type: string;
    cloud_id: string | null;
    ref: string | null;
    hourly_usd: string | null;
    detail: string;
    observed_at: string;
    resolved_at: string | null;
  }

  const showAll = process.argv.includes("--all");
  const rows = await db.select<Row>(
    "drift_observations",
    `select=*&order=observed_at.desc${showAll ? "" : "&resolved_at=is.null"}&limit=100`,
  );

  const age = (from: string, to: string | null) => {
    const ms = (to ? Date.parse(to) : Date.now()) - Date.parse(from);
    const h = ms / 3_600_000;
    return h < 1 ? `${Math.round(ms / 60_000)}m` : h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
  };

  console.log(`\nDrift history — ${showAll ? "all" : "open"} observations (${rows.length})`);
  console.log("─".repeat(100));
  for (const r of rows) {
    console.log(
      `  ${r.kind.padEnd(11)} ${r.resource_type.padEnd(13)} ` +
        `${(r.resolved_at ? "resolved after" : "open for").padEnd(14)} ${age(r.observed_at, r.resolved_at).padStart(6)}  ` +
        `${r.hourly_usd ? `$${Number(r.hourly_usd).toFixed(4)}/hr  ` : ""}${r.detail.slice(0, 48)}`,
    );
  }
  if (rows.length === 0) console.log(`  nothing ${showAll ? "recorded" : "open"}.`);
  console.log("");
  process.exit(0);
}

const k = kube(loadKubeconfig(KUBECONFIG));
const namespace = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";

// ── fleet ───────────────────────────────────────────────────────────────────

const [cloud, plane] = await Promise.all([loadCloudInventory(), loadControlPlane()]);
const fleetReport = reconcile({
  lkeClusters: cloud.lkeClusters,
  instances: cloud.instances,
  nodeBalancers: cloud.nodeBalancers,
  clusterRows: plane.clusterRows,
  buildVmRows: plane.buildVmRows,
  pricing: cloud.pricing,
  now: new Date(),
  v2Tag: "ahura-v2",
  buildTag: "ahura-v2-build",
});

// ── hostnames ───────────────────────────────────────────────────────────────

const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
  `/api/v1/namespaces/${namespace}/services/traefik`,
  true,
);
const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip ?? "";

const [ingressList, records, aliases] = await Promise.all([
  k.get<{ items: Array<{ metadata: { name: string; namespace: string }; spec?: { rules?: Array<{ host?: string }> } }> }>(
    "/apis/networking.k8s.io/v1/ingresses",
    true,
  ),
  listDnsRecords(),
  db.select<AliasLike>("aliases", "select=ref,hostname,kind,deployment_id"),
]);

const hostnameReport = gatewayIp
  ? reconcileHostnames({
      records,
      ingresses: (ingressList?.items ?? []).map(ingressHosts),
      aliases,
      gatewayIp,
      appDomain: paasConfig.appDomain(),
    })
  : null;

// ── R2 ──────────────────────────────────────────────────────────────────────

const [objects, deployments, projects] = await Promise.all([
  listObjects(""),
  db.select<DeploymentLike>("deployments", "select=ref,state,image_digest"),
  db.select<{ ref: string }>("projects", "select=ref"),
]);
const r2Report = reconcileR2({ objects, deployments, liveProjectRefs: projects.map((p) => p.ref) });

// ── collect ─────────────────────────────────────────────────────────────────

const sweeps: Array<{ name: string; observations: Observation[]; scope: SweepScope[] }> = [
  {
    name: "fleet",
    observations: observationsFromFleet(fleetReport.findings, fleetReport.unpriced),
    scope: FLEET_SCOPE,
  },
  {
    name: "hostnames",
    observations: hostnameReport ? observationsFromHostnames(hostnameReport.findings) : [],
    scope: HOSTNAME_SCOPE,
  },
  { name: "r2", observations: observationsFromR2(r2Report.findings), scope: R2_SCOPE },
];

const line = "─".repeat(92);
console.log(`\nDrift sweep${RECORD ? "" : " (report only)"}\n${line}`);

if (!gatewayIp) {
  console.log(`  hostnames SKIPPED — gateway has no LoadBalancer address; not recording a false clean\n`);
}

let total = 0;
for (const s of sweeps) {
  console.log(`  ${s.name.padEnd(11)} ${s.observations.length} open observation(s)`);
  for (const o of s.observations) {
    // Show the detail, not the identity. The identity is whatever the RPC
    // matches on — for a hostname that is a Cloudflare record id, which tells
    // a reader nothing about which hostname is affected.
    console.log(
      `    ${o.kind.padEnd(11)} ${o.resourceType.padEnd(14)} ` +
        `${o.detail.slice(0, 60).padEnd(60)} ` +
        `${o.hourlyUsd === null ? "" : `$${o.hourlyUsd.toFixed(4)}/hr`}`,
    );
  }
  total += s.observations.length;
}

console.log(line);
console.log(`  ${total} observation(s) across ${sweeps.length} sweep(s)`);
if (UNMAPPED.length) {
  console.log(
    `  NOT recorded, no honest drift_kind for them: ${UNMAPPED.join(", ")}. ` +
      `Still reported by their own tools.`,
  );
}

if (!RECORD) {
  console.log(`\n  Report only. Re-run with --record to write history.\n`);
  process.exit(0);
}

// ── write ───────────────────────────────────────────────────────────────────

let recorded = 0;
let resolved = 0;

for (const s of sweeps) {
  // A sweep that could not run must NOT resolve its scope: an empty result
  // from a failed read is indistinguishable from a clean result, and closing
  // every open observation because Cloudflare was briefly unreachable would
  // erase exactly the durations this table exists to measure.
  if (s.name === "hostnames" && !gatewayIp) continue;

  for (const o of s.observations) {
    await rpc<string>("record_drift", {
      p_kind: o.kind,
      p_resource_type: o.resourceType,
      p_cloud_id: o.cloudId,
      p_ref: o.ref,
      p_hourly_usd: o.hourlyUsd,
      p_detail: o.detail.slice(0, 2000),
    });
    recorded += 1;
  }

  for (const g of groupForResolve(s.observations, s.scope)) {
    resolved += await rpc<number>("resolve_drift_not_in", {
      p_kind: g.kind,
      p_resource_type: g.resourceType,
      p_still_open: g.stillOpen,
    });
  }
}

console.log(`\n  recorded ${recorded} open observation(s), resolved ${resolved} that cleared\n`);
