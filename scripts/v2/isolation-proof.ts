/**
 * Prove tenant isolation is ENFORCED, not merely declared.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/isolation-proof.ts
 *
 * WHY THIS EXISTS
 *
 * `tenantNetworkPolicy` denies the cloud metadata endpoint, the private ranges
 * and cross-tenant traffic. Three copies of it are applied and Calico is
 * running. None of that is evidence: a NetworkPolicy on a cluster whose CNI does
 * not enforce policy is accepted by the API server, stored, listed, and does
 * NOTHING. It is the purest form of the guard that examines nothing — it does
 * not even run, and everything about it looks correct from the outside.
 *
 * Before opening signups to untrusted tenants, the question is not what the
 * policy says. It is what a pod in a tenant namespace can actually reach.
 *
 * THE CONTROLS ARE THE POINT
 *
 * A probe pod with no working network at all fails every negative test and would
 * report perfect isolation. So two probes MUST SUCCEED — public egress and DNS —
 * and if they do not, the run is void rather than clean. "Everything was
 * blocked" and "nothing was tried" produce identical failure lists, and only the
 * controls separate them.
 *
 * The probe runs under the same gVisor RuntimeClass as real tenant workloads, in
 * a real tenant namespace, so what it measures is what a customer's container
 * gets — not what a privileged debug pod gets.
 *
 * EXIT CODES: 0 isolation holds, 1 could not run, 11 URGENT — a tenant can reach
 * something it must not.
 */

import { kubeContextFromEnv } from "../../lib/paas/reconciler.ts";
import { kube } from "../../lib/paas/k8s/client.ts";
import { projects, db } from "../../lib/paas/db.ts";
import { GVISOR_RUNTIME_CLASS } from "../../lib/paas/k8s/gvisor.ts";

const EXIT_CANNOT_RUN = 1;
const EXIT_URGENT = 11;
const KEEP = process.argv.includes("--keep");

interface Probe {
  name: string;
  /** "blocked" = a tenant must NOT reach this. "open" = a tenant MUST reach it. */
  expect: "blocked" | "open";
  why: string;
  cmd: string;
}

async function main(): Promise<void> {
  if (!(await db.reachable())) {
    console.error("control plane unreachable — proving nothing");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const ctx = kubeContextFromEnv();
  const k = kube(ctx);

  const allProjects = await projects.list();
  if (allProjects.length < 2) {
    console.error("need at least two tenants to prove cross-tenant isolation — proving nothing");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  // A real tenant pod belonging to a DIFFERENT tenant than the one we probe
  // from. Probing our own namespace would prove nothing: same-namespace traffic
  // is not what the policy restricts.
  const pods = await k.get<{ items?: Array<{ metadata?: { namespace?: string; name?: string }; status?: { podIP?: string } }> }>(
    "/api/v1/pods",
  );
  const tenantPods = (pods?.items ?? []).filter(
    (p) => p.metadata?.namespace?.startsWith("app-") && p.status?.podIP,
  );
  if (tenantPods.length < 2) {
    console.error("need running pods in two tenant namespaces — proving nothing");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const from = tenantPods[0].metadata!.namespace!;
  const victim = tenantPods.find((p) => p.metadata!.namespace !== from)!;
  const victimIp = victim.status!.podIP!;

  const kubernetesSvc = await k.get<{ spec?: { clusterIP?: string } }>("/api/v1/namespaces/default/services/kubernetes");
  const apiIp = kubernetesSvc?.spec?.clusterIP ?? "10.128.0.1";

  const probes: Probe[] = [
    {
      name: "cloud-metadata",
      expect: "blocked",
      why: "169.254.169.254 hands out the node's Linode credentials. Reaching it is cluster takeover, not a leak.",
      cmd: `wget -T 4 -q -O- http://169.254.169.254/ 2>/dev/null`,
    },
    {
      name: "cross-tenant-pod",
      expect: "blocked",
      why: `${victimIp} is another customer's container. Reaching it is the multi-tenancy boundary failing.`,
      cmd: `nc -z -w 4 ${victimIp} 3000 2>/dev/null`,
    },
    {
      name: "kubernetes-api",
      expect: "blocked",
      why: `${apiIp}:443 is the API server. A tenant that reaches it can start probing for credentials.`,
      cmd: `nc -z -w 4 ${apiIp} 443 2>/dev/null`,
    },
    {
      name: "CONTROL-public-egress",
      expect: "open",
      why: "Apps legitimately call the internet. If this is blocked the pod has no network and every result above is void.",
      cmd: `nc -z -w 6 1.1.1.1 443 2>/dev/null`,
    },
    {
      name: "CONTROL-dns",
      expect: "open",
      why: "Same reason. A pod that cannot resolve names cannot meaningfully fail to reach anything by name.",
      cmd: `nslookup cloudflare.com >/dev/null 2>&1`,
    },
  ];

  // Each probe prints its own verdict. Exit status is read per-probe rather than
  // for the script as a whole, so one failing probe cannot mask the rest.
  const script = probes
    .map((p) => `if ${p.cmd}; then echo "RESULT ${p.name} open"; else echo "RESULT ${p.name} blocked"; fi`)
    .join("\n");

  const podName = `isolation-proof-${Date.now().toString(36)}`;
  console.log(`\nTenant isolation — probing from ${from}, under RuntimeClass ${GVISOR_RUNTIME_CLASS}`);
  console.log("─".repeat(96));

  await k.apply(`/api/v1/namespaces/${from}/pods/${podName}`, {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      namespace: from,
      labels: { "app.kubernetes.io/managed-by": "ahura-paas", "ahura.cloud/probe": "isolation" },
    },
    spec: {
      runtimeClassName: GVISOR_RUNTIME_CLASS,
      restartPolicy: "Never",
      // No ServiceAccount token. A probe that carried one would be testing a
      // more privileged pod than any tenant workload gets.
      automountServiceAccountToken: false,
      containers: [
        {
          name: "probe",
          image: "busybox:1.36",
          command: ["sh", "-c", script],
          resources: { requests: { cpu: "50m", memory: "64Mi" }, limits: { cpu: "200m", memory: "128Mi" } },
        },
      ],
    },
  });

  // Wait for it to finish.
  let phase = "Pending";
  let logs = "";
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const p = await k.get<{ status?: { phase?: string } }>(`/api/v1/namespaces/${from}/pods/${podName}`, true);
    phase = p?.status?.phase ?? "Unknown";
    if (phase === "Succeeded" || phase === "Failed") break;
  }

  try {
    logs = String(await k.raw({ method: "GET", path: `/api/v1/namespaces/${from}/pods/${podName}/log`  }));
  } catch (e) {
    logs = "";
  }

  if (!KEEP) {
    await k.raw({ method: "DELETE", path: `/api/v1/namespaces/${from}/pods/${podName}` }).catch(() => {});
  }

  const results = new Map<string, string>();
  for (const m of logs.matchAll(/^RESULT (\S+) (open|blocked)$/gm)) results.set(m[1], m[2]);

  // A probe that produced no result is UNKNOWN, and unknown is not "blocked".
  // Reading a missing result as a pass is exactly how a guard that never ran
  // reports success.
  if (results.size !== probes.length) {
    console.error(`  probe pod ended ${phase} with ${results.size}/${probes.length} results — proving nothing`);
    if (logs.trim()) console.error(`  logs:\n${logs.trim().split("\n").map((l) => "    " + l).join("\n")}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const controlsFailed = probes
    .filter((p) => p.expect === "open" && results.get(p.name) !== "open")
    .map((p) => p.name);

  const breaches: Probe[] = [];
  for (const p of probes) {
    const got = results.get(p.name)!;
    const ok = got === p.expect;
    const label = p.expect === "blocked" ? (ok ? "BLOCKED  " : "REACHABLE") : ok ? "reachable" : "UNREACHABLE";
    console.log(`  ${label}  ${p.name.padEnd(22)} ${ok ? "" : "<-- "}${p.why}`);
    if (!ok && p.expect === "blocked") breaches.push(p);
  }

  console.log();
  if (controlsFailed.length) {
    console.error(`  VOID — controls failed: ${controlsFailed.join(", ")}.`);
    console.error(`  A pod with no working network fails every negative probe and looks perfectly`);
    console.error(`  isolated. Nothing above can be trusted until the controls pass.`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  if (breaches.length) {
    console.error(`  ${breaches.length} BREACH(ES). A tenant can reach something it must not.`);
    console.error(`  Signups must not open while any of these stands.`);
    process.exitCode = EXIT_URGENT;
    return;
  }

  console.log("  Isolation holds: metadata, cross-tenant and the API server are all unreachable,");
  console.log("  and the controls confirm the probe had a working network throughout.");
}

await main();
