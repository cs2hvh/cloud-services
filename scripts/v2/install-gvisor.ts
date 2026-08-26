/**
 * Install gVisor onto the runtime pool and prove it actually sandboxes.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/install-gvisor.ts [--apply]
 *
 * This restarts containerd on the runtime node, which restarts the workloads
 * there. The system pool — gateway and registry — is untouched, so ingress and
 * image pulls keep working throughout.
 */

import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import {
  GVISOR_RELEASE,
  GVISOR_RUNTIME_CLASS,
  gvisorRuntimeClass,
  gvisorInstallerDaemonSet,
} from "../../lib/paas/k8s/gvisor.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

console.log(`\ngVisor install — release ${GVISOR_RELEASE}\n` + "─".repeat(76));
console.log("scope       runtime pool only (system pool untouched)");
console.log("effect      restarts containerd on the runtime node; its pods restart");

if (!APPLY) {
  console.log("\nWould apply:");
  console.log(`  RuntimeClass ${GVISOR_RUNTIME_CLASS}`);
  console.log(`  DaemonSet gvisor-installer (privileged, hostPath /, runtime pool)`);
  console.log("\nDry run. Re-run with --apply.");
  process.exit(0);
}

await k.apply(`/apis/node.k8s.io/v1/runtimeclasses/${GVISOR_RUNTIME_CLASS}`, gvisorRuntimeClass());
console.log(`\napplied     RuntimeClass ${GVISOR_RUNTIME_CLASS}`);

await k.apply(
  `/apis/apps/v1/namespaces/${PAAS_NAMESPACE}/daemonsets/gvisor-installer`,
  gvisorInstallerDaemonSet(),
);
console.log("applied     DaemonSet gvisor-installer");

console.log("\nWaiting for the installer…");
const deadline = Date.now() + 8 * 60_000;
let installerLog = "";
while (Date.now() < deadline) {
  const pods = (await k.listPods(PAAS_NAMESPACE)).filter(
    (p) => p.metadata.labels?.["ahura.cloud/component"] === "gvisor-installer",
  );
  if (pods.length) {
    const p = pods[0];
    const log = await k
      .raw<string>({
        method: "GET",
        path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${p.metadata.name}/log`,
        allowMissing: true,
      })
      .catch(() => null);
    installerLog = String(log ?? "");
    if (/install complete|nothing to do/.test(installerLog)) break;
    if (/sha512sum: .*FAILED|curl: \(/.test(installerLog)) {
      console.log("\nINSTALLER FAILED:\n" + installerLog.slice(-1500));
      process.exit(1);
    }
  }
  process.stdout.write("\r  installing…      ");
  await new Promise((r) => setTimeout(r, 8000));
}
console.log("");
console.log(installerLog.trim().split("\n").slice(-12).join("\n"));

// ── prove it ────────────────────────────────────────────────────────────────
// A RuntimeClass that exists proves nothing. The only honest check is running a
// pod under it and asking the kernel what it is: gVisor reports itself in
// /proc/version, and a normal container reports the host's Linux kernel.
console.log("\nProving the sandbox is real…");

const probe = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name: "gvisor-proof", namespace: PAAS_NAMESPACE, labels: { "app.kubernetes.io/managed-by": "ahura-paas" } },
  spec: {
    restartPolicy: "Never",
    runtimeClassName: GVISOR_RUNTIME_CLASS,
    nodeSelector: { "ahura.cloud/pool": "runtime" },
    tolerations: [{ key: "ahura.cloud/runtime", operator: "Equal", value: "true", effect: "NoSchedule" }],
    containers: [
      {
        name: "probe",
        image: "alpine:3.20",
        command: ["sh", "-c", "echo KERNEL: $(cat /proc/version); echo DMESG: $(dmesg 2>&1 | head -1)"],
        securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
      },
    ],
  },
};

await k.delete(`/api/v1/namespaces/${PAAS_NAMESPACE}/pods/gvisor-proof`);
await new Promise((r) => setTimeout(r, 3000));
await k.raw({ method: "POST", path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods`, body: probe });

const proofDeadline = Date.now() + 3 * 60_000;
let phase = "";
while (Date.now() < proofDeadline) {
  const p = await k.get<{ status?: { phase?: string } }>(
    `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/gvisor-proof`,
    true,
  );
  phase = p?.status?.phase ?? "";
  if (phase === "Succeeded" || phase === "Failed") break;
  process.stdout.write(`\r  ${phase || "pending"}…      `);
  await new Promise((r) => setTimeout(r, 4000));
}
console.log("");

const proofLog = String(
  (await k
    .raw<string>({
      method: "GET",
      path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/gvisor-proof/log`,
      allowMissing: true,
    })
    .catch(() => "")) ?? "",
);

console.log(proofLog.trim() || `(no output, phase=${phase})`);

const sandboxed = /gvisor/i.test(proofLog);
await k.delete(`/api/v1/namespaces/${PAAS_NAMESPACE}/pods/gvisor-proof`);

console.log("\n" + "═".repeat(76));
if (sandboxed) {
  console.log("SANDBOX CONFIRMED — the kernel the container sees is gVisor, not the host's.");
  console.log("Tenant pods can now set runtimeClassName: gvisor.");
} else {
  console.log("NOT SANDBOXED — the pod ran, but reported a host kernel rather than gVisor.");
  console.log("Do not schedule untrusted workloads under this RuntimeClass yet.");
  process.exit(1);
}
