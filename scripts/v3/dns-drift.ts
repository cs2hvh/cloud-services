/**
 * Reconcile hostnames across Cloudflare DNS, cluster Ingress objects, and
 * paas.aliases.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/dns-drift.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/dns-drift.ts --json
 *
 * Exits 1 when something needs a human, 2 when a hostname is CLAIMABLE — a
 * record resolving to our gateway that no Ingress routes. That is not
 * housekeeping: the next Ingress to name it, in any tenant namespace, receives
 * its traffic. It gets its own exit code so a scheduler can page on it
 * differently from ordinary drift.
 *
 * READ-ONLY. Reports; never creates or deletes a record. Deleting DNS on the
 * strength of a classification is how a working app goes dark.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_URGENT, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { paasConfig } from "../../lib/paas/config.ts";
import { listDnsRecords } from "../../lib/paas/edge/cloudflare.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import {
  ingressHosts,
  reconcileHostnames,
  type AliasLike,
  type HostnameFinding,
} from "../../lib/paas/telemetry/dns-drift.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const PAAS_NAMESPACE = process.env.V2_PAAS_NAMESPACE ?? "ahura-system";
const JSON_OUT = process.argv.includes("--json");

const ctx = loadKubeconfig(KUBECONFIG);
const k = kube(ctx);

if (!(await k.healthz())) {
  console.error("cluster unreachable");
  process.exit(EXIT_CANNOT_RUN);
}

// The gateway's own address is the authority on what "points at us" means —
// same source publish-app.ts mints records from, so the two cannot disagree.
const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
  `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
);
const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip;
if (!gatewayIp) {
  console.error("gateway has no LoadBalancer address — cannot tell which records are ours");
  process.exit(EXIT_CANNOT_RUN);
}

const ingressList = await k.get<{
  items: Array<{ metadata: { name: string; namespace: string }; spec?: { rules?: Array<{ host?: string }> } }>;
}>("/apis/networking.k8s.io/v1/ingresses", true);

const [records, aliases] = await Promise.all([
  listDnsRecords(),
  db.select<AliasLike>("aliases", "select=ref,hostname,kind,deployment_id&order=created_at"),
]);

const report = reconcileHostnames({
  records,
  ingresses: (ingressList?.items ?? []).map(ingressHosts),
  aliases,
  gatewayIp,
  appDomain: paasConfig.appDomain(),
});

if (JSON_OUT) {
  console.log(JSON.stringify({ gatewayIp, appDomain: paasConfig.appDomain(), ...report }, null, 2));
  process.exit(report.claimable > 0 ? EXIT_URGENT : report.clean ? EXIT_CLEAN : EXIT_FINDINGS);
}

const line = "─".repeat(96);
const render = (f: HostnameFinding) =>
  `  ${f.status.toUpperCase().padEnd(12)} ${f.hostname.padEnd(38)} ${(f.ingress ?? "—").padEnd(28)} ${f.ref ?? "—"}\n` +
  `               ${f.detail}` +
  (f.action ? `\n               → ${f.action}` : "");

console.log(`\nHostname drift — Cloudflare DNS vs Ingress vs paas.aliases`);
console.log(line);
console.log(`  gateway ${gatewayIp}   apex ${paasConfig.appDomain()}`);
console.log(
  `  ${records.length} DNS record(s), ${(ingressList?.items ?? []).length} Ingress object(s), ` +
    `${aliases.length} alias row(s)`,
);
console.log(line);

const shown = report.findings.filter((f) => f.status !== "foreign");
for (const f of shown) console.log(render(f));

const foreign = report.findings.filter((f) => f.status === "foreign");
if (foreign.length) {
  console.log(`\n  ${foreign.length} record(s) not ours, listed and untouched:`);
  console.log(`    ${foreign.map((f) => f.hostname).join(", ")}`);
}

console.log(`\n${line}`);
if (report.claimable > 0) {
  console.log(
    `  ${report.claimable} CLAIMABLE hostname(s) — resolving to our gateway with nothing routing them.\n` +
      `  Any tenant who names one in their own Ingress receives its traffic.`,
  );
} else {
  console.log(`  0 claimable hostnames.`);
}
console.log(
  report.clean
    ? `  Every hostname has a record, a route and a row.\n`
    : `  ${report.findings.filter((f) => f.actionable).length} finding(s) need a human. Nothing was changed.\n`,
);

process.exit(report.claimable > 0 ? EXIT_URGENT : report.clean ? EXIT_CLEAN : EXIT_FINDINGS);
