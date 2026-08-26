/**
 * Does each tenant's egress policy still deny what it was written to deny?
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/netpolicy-drift.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/netpolicy-drift.ts --json
 *
 * The deploy lane found a tenant pod could open a socket to the API server
 * despite an egress rule denying 10.0.0.0/8: kube-proxy DNATs the ClusterIP to
 * the real endpoint BEFORE egress policy is evaluated, and on LKE that endpoint
 * is public. AN `except` LIST CANNOT PROTECT AN ADDRESS THE POLICY NEVER SEES.
 *
 * They fixed it by denying the endpoint's real address, read from the
 * `kubernetes` Endpoints at reconcile time. WHICH IS WHY THIS EXISTS: a policy
 * written from a value read once is correct until that value moves. The control
 * plane's address changes on an upgrade, a rebuild or a failover, and every
 * deployed policy then silently stops covering it. Nothing fails. The hole
 * reopens.
 *
 * READ-ONLY, AND DELIBERATELY NOT A PROBE. `scripts/v2/isolation-proof.ts`
 * answers the stronger question — what a pod can ACTUALLY reach — by creating a
 * pod and deleting it, which is a write. This lane creates nothing, and the
 * sweeps' ClusterRole is `get`/`list` only with a test enforcing it. So this
 * checks the CONFIGURATION continuously and cheaply; the probe proves BEHAVIOUR
 * and belongs where writes are allowed. Neither substitutes for the other: this
 * cannot see a rule that does not do what it says, and the probe cannot run
 * every fifteen minutes.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_URGENT, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { checkNetpolicies, type NamespaceLike } from "../../lib/paas/telemetry/netpolicy-drift.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable — nothing measured");
  process.exit(EXIT_CANNOT_RUN);
}

// The addresses kube-proxy actually DNATs the API ClusterIP to. Null on any
// failure — never an empty array, which would make every policy look
// sufficient because there is nothing left to fail against.
interface Endpoints {
  subsets?: Array<{ addresses?: Array<{ ip: string }> }>;
}
let controlPlaneEndpoints: string[] | null = null;
try {
  const ep = await k.get<Endpoints>("/api/v1/namespaces/default/endpoints/kubernetes", true);
  if (ep) {
    const ips = (ep.subsets ?? []).flatMap((s) => (s.addresses ?? []).map((a) => a.ip)).filter(Boolean);
    controlPlaneEndpoints = ips.length > 0 ? [...new Set(ips)] : [];
  }
} catch {
  controlPlaneEndpoints = null;
}

const nsList = await k.listNamespaces();
const tenantNamespaces = nsList.map((n) => n.metadata.name).filter((n) => n.startsWith("app-prj-"));

interface NetworkPolicyRow {
  metadata: { name: string };
  spec?: { egress?: Array<{ to?: Array<{ ipBlock?: { cidr: string; except?: string[] } }> }> };
}
interface PodRow {
  status?: { phase?: string };
}

const namespaces: NamespaceLike[] = [];
for (const ns of tenantNamespaces) {
  let policies: NamespaceLike["policies"] = null;
  try {
    const list = await k.get<{ items: NetworkPolicyRow[] }>(
      `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies`,
      true,
    );
    // A null response is unreadable; an empty items array is a namespace with
    // no policy, which is the finding. They must not collapse.
    policies =
      list === null
        ? null
        : (list.items ?? []).map((p) => ({
            name: p.metadata.name,
            deniedCidrs: (p.spec?.egress ?? []).flatMap((e) =>
              (e.to ?? []).flatMap((t) => t.ipBlock?.except ?? []),
            ),
          }));
  } catch {
    policies = null;
  }

  let pods = 0;
  try {
    const list = await k.get<{ items: PodRow[] }>(`/api/v1/namespaces/${ns}/pods`, true);
    pods = (list?.items ?? []).filter((p) => p.status?.phase === "Running").length;
  } catch {
    pods = 0;
  }

  namespaces.push({ namespace: ns, policies, pods });
}

const report = checkNetpolicies({ namespaces, controlPlaneEndpoints });
const urgent = report.findings.filter((f) => f.urgent);

const code = report.void
  ? EXIT_CANNOT_RUN
  : urgent.length > 0
    ? EXIT_URGENT
    : report.clean
      ? EXIT_CLEAN
      : EXIT_FINDINGS;

if (JSON_OUT) {
  console.log(JSON.stringify({ controlPlaneEndpoints, ...report }, null, 2));
  process.exitCode = code;
} else {
  const line = "─".repeat(96);
  console.log(`\nTenant egress policy — configuration, against the live control plane`);
  console.log(line);
  console.log(
    `  ${report.examined} tenant namespace(s).  control plane at ` +
      `${controlPlaneEndpoints === null ? "UNREADABLE" : controlPlaneEndpoints.join(", ") || "NO ADDRESSES"}`,
  );

  if (report.void) {
    console.log(`\n  RUN VOID — ${report.voidReason}.`);
    console.log(
      `\n  The policies below may be perfect and this run has not shown it. An\n` +
        `  unreadable endpoint list leaves nothing for a policy to fail against, so\n` +
        `  every one of them would look sufficient.\n`,
    );
  }

  console.log("");
  for (const f of report.findings) {
    console.log(
      `  ${f.verdict.toUpperCase().padEnd(26)} ${f.namespace.padEnd(24)} ${f.pods} pod(s)${f.urgent ? "   <-- URGENT" : ""}`,
    );
    if (f.verdict !== "protected") console.log(`      ${f.detail}`);
  }

  console.log(`\n${line}`);
  if (urgent.length) {
    console.log(
      `  ${urgent.length} namespace(s) need attention now. A tenant that can open a socket to\n` +
        `  the API server makes any pre-auth weakness there reachable from untrusted code,\n` +
        `  and one with no policy at all has nothing constraining its egress whatever.\n`,
    );
  } else if (report.clean) {
    console.log(
      `  Every tenant denies the private ranges, link-local, and every current\n` +
        `  control-plane endpoint.\n`,
    );
  }
  console.log(
    `  Configuration only. This cannot see a rule that does not do what it says —\n` +
      `  scripts/v2/isolation-proof.ts answers that by actually connecting, and it\n` +
      `  writes, so it lives in the deploy lane rather than here.\n`,
  );
  process.exitCode = code;
}
