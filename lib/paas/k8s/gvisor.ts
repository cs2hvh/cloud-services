/**
 * gVisor installer.
 *
 * WHY THIS IS NOT OPTIONAL
 *
 * Three runC container-escape CVEs landed in November 2025. A Linux container
 * is a resource boundary, not a security boundary, and this platform's whole
 * premise is running code its authors are hostile to. Until a sandbox exists,
 * "untrusted public signups" is not a thing we can honestly offer.
 *
 * WHY gVISOR AND NOT KATA
 *
 * Kata, Firecracker and Cloud Hypervisor all need /dev/kvm. Linode has no
 * nested virtualisation on any instance family and sells no bare metal, so
 * every microVM design is closed to us on this substrate. gVisor's runsc is a
 * userspace kernel — it intercepts syscalls in Go rather than virtualising
 * hardware — so it needs no KVM and runs anywhere. Builds get the hypervisor
 * boundary a different way, by renting a whole throwaway Linode each.
 *
 * WHY A DAEMONSET AND NOT NODE CONFIGURATION
 *
 * LKE gives no way to supply custom node images, kubelet config or containerd
 * config, and it recreates nodes on its own schedule. Anything installed by
 * hand is lost at the next node recycle. A DaemonSet re-runs on every node that
 * joins, which is the only durable option here.
 *
 * BLAST RADIUS
 *
 * Scoped to the `runtime` pool only. The `system` pool — gateway, registry —
 * is never touched, so a failed install cannot take down ingress or image
 * pulls. Installing restarts containerd on the target node, which restarts the
 * pods there; the installer is idempotent and restarts containerd ONLY when it
 * actually changed something, so a DaemonSet pod restart does not cycle the
 * node's containerd.
 */

import { PAAS_NAMESPACE, ownerLabels } from "./manifests.ts";

/**
 * Pinned, not `latest`. This is security-critical software installed onto every
 * node that runs hostile code; a floating tag means the thing you audited is
 * not necessarily the thing that gets installed.
 */
export const GVISOR_RELEASE = "20260817";

export const GVISOR_RUNTIME_CLASS = "gvisor";

/** RuntimeClass a pod references to be sandboxed. `handler` matches the containerd runtime name. */
export function gvisorRuntimeClass() {
  return {
    apiVersion: "node.k8s.io/v1",
    kind: "RuntimeClass",
    metadata: { name: GVISOR_RUNTIME_CLASS, labels: ownerLabels() },
    handler: "runsc",
    // Sandboxed pods land only where the sandbox exists.
    scheduling: {
      nodeSelector: { "ahura.cloud/pool": "runtime" },
      tolerations: [
        { key: "ahura.cloud/runtime", operator: "Equal", value: "true", effect: "NoSchedule" },
      ],
    },
    overhead: {
      /**
       * The sentry and gofer are real processes with real cost. Declaring it
       * lets the scheduler account for them instead of overcommitting nodes.
       *
       * 64Mi is MEASURED, not guessed. The previous 128Mi was assumed, and it
       * set the pod density every price in 05-pricing.md was derived from — so
       * it was not a spare-capacity decision, it was a pricing input.
       *
       * `scripts/v2/sandbox-loadtest.ts` runs one workload twice, sandboxed and
       * not, both measured externally through cAdvisor so the two readings share
       * a frame of reference:
       *
       *   gvisor  peak 269.3 MiB   runc  peak 227.0 MiB   ->  42.3 MiB
       *   gvisor  med  253.1 MiB   runc  med  207.8 MiB   ->  45.3 MiB
       *
       * The workload holds 192 MiB touched page by page, then loops file I/O
       * through the gofer and syscalls through the sentry — the two things a
       * sandbox actually taxes, and the two things idle apps do neither of.
       * 64Mi is that peak plus 50%, rounded up.
       *
       * WHY THE HEADROOM IS NOT OPTIONAL. Under-declaring produces no warning of
       * any kind: the scheduler simply accepts more pods than the node can hold,
       * and the kernel OOM-kills whichever allocates next — which may be a
       * different tenant than the one that caused it. Silent, delayed, and it
       * lands on the wrong person.
       *
       * The cut is reversible because something now watches for it.
       * `scripts/v3/sandbox-overhead.ts` tracks whole-pod usage against whole
       * reservation continuously, so pods running hot show up before a node
       * does. Raise this number back if that report starts climbing.
       *
       * Existing pods keep the old overhead until they are recreated; the
       * change applies at admission, so it rolls in gradually rather than all
       * at once.
       */
      podFixed: { cpu: "80m", memory: "64Mi" },
    },
  };
}

/**
 * Installer script, as an array of lines rather than a template literal —
 * shell `${VAR}` and JS `${expr}` are the same syntax and mixing them is how
 * v1's injection bugs happened. Substitution is explicit, once, at the end.
 */
const INSTALL_LINES: string[] = [
  "#!/bin/sh",
  "set -eu",
  "",
  "MARKER=/host/var/lib/ahura-gvisor-release",
  "WANT=@@RELEASE@@",
  "",
  'echo "ahura gvisor installer — target release $WANT"',
  "",
  "# Idempotence: if this exact release is installed AND containerd already",
  "# knows the runsc runtime, do nothing. Restarting containerd on every pod",
  "# restart would cycle every workload on the node for no reason.",
  'if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$WANT" ] \\',
  '   && [ -x /host/usr/local/bin/runsc ] \\',
  '   && grep -q "runtimes.runsc" /host/etc/containerd/config.toml; then',
  '  echo "already installed and configured — nothing to do"',
  "  exec sleep infinity",
  "fi",
  "",
  "apk add --no-cache curl >/dev/null 2>&1 || true",
  "",
  "URL=https://storage.googleapis.com/gvisor/releases/release/$WANT/x86_64",
  "cd /tmp",
  'echo "downloading runsc and shim"',
  'curl -fsSL -o runsc "$URL/runsc"',
  'curl -fsSL -o runsc.sha512 "$URL/runsc.sha512"',
  'curl -fsSL -o containerd-shim-runsc-v1 "$URL/containerd-shim-runsc-v1"',
  'curl -fsSL -o containerd-shim-runsc-v1.sha512 "$URL/containerd-shim-runsc-v1.sha512"',
  "",
  "# Verify before installing. These binaries run as root on a node that hosts",
  "# hostile code; an unverified download would be a supply-chain hole in the",
  "# very thing meant to contain it.",
  'echo "verifying checksums"',
  "sha512sum -c runsc.sha512",
  "sha512sum -c containerd-shim-runsc-v1.sha512",
  "",
  "chmod 755 runsc containerd-shim-runsc-v1",
  "cp -f runsc containerd-shim-runsc-v1 /host/usr/local/bin/",
  'echo "binaries installed to /usr/local/bin"',
  "",
  "# Register the runtime with containerd if it is not already there. The config",
  "# uses schema version 2, so the plugin path is io.containerd.grpc.v1.cri.",
  "CFG=/host/etc/containerd/config.toml",
  'if grep -q "runtimes.runsc" "$CFG"; then',
  '  echo "containerd already declares runsc"',
  "  CHANGED=no",
  "else",
  '  cp "$CFG" "$CFG.ahura-backup.$(date +%s)"',
  '  printf "\\n%s\\n%s\\n%s\\n" \\',
  '    "[plugins.\\"io.containerd.grpc.v1.cri\\".containerd.runtimes.runsc]" \\',
  '    "  runtime_type = \\"io.containerd.runsc.v1\\"" \\',
  '    "  pod_annotations = [\\"dev.gvisor.*\\"]" >> "$CFG"',
  '  echo "appended runsc runtime to containerd config (backup written)"',
  "  CHANGED=yes",
  "fi",
  "",
  'echo "$WANT" > "$MARKER"',
  "",
  'if [ "$CHANGED" = "yes" ]; then',
  '  echo "restarting containerd — workloads on this node will restart"',
  "  nsenter --target 1 --mount --uts --ipc --net --pid -- systemctl restart containerd",
  '  echo "containerd restarted"',
  "else",
  '  echo "no containerd change; not restarting"',
  "fi",
  "",
  'echo "gvisor install complete"',
  "exec sleep infinity",
  "",
];

export function renderGvisorInstaller(release = GVISOR_RELEASE): string {
  return INSTALL_LINES.join("\n").split("@@RELEASE@@").join(release);
}

export function gvisorInstallerDaemonSet(release = GVISOR_RELEASE) {
  return {
    apiVersion: "apps/v1",
    kind: "DaemonSet",
    metadata: {
      name: "gvisor-installer",
      namespace: PAAS_NAMESPACE,
      labels: ownerLabels({ "ahura.cloud/component": "gvisor-installer" }),
    },
    spec: {
      selector: { matchLabels: { "ahura.cloud/component": "gvisor-installer" } },
      template: {
        metadata: {
          labels: ownerLabels({ "ahura.cloud/component": "gvisor-installer" }),
          annotations: { "ahura.cloud/gvisor-release": release },
        },
        spec: {
          // Runtime pool ONLY. The system pool runs the gateway and registry;
          // a failed install there would take down ingress and image pulls.
          nodeSelector: { "ahura.cloud/pool": "runtime" },
          tolerations: [
            { key: "ahura.cloud/runtime", operator: "Equal", value: "true", effect: "NoSchedule" },
          ],
          hostPID: true,
          containers: [
            {
              name: "installer",
              image: "alpine:3.20",
              command: ["sh", "-c", renderGvisorInstaller(release)],
              securityContext: { privileged: true },
              volumeMounts: [{ name: "host", mountPath: "/host" }],
              resources: { requests: { cpu: "50m", memory: "64Mi" }, limits: { cpu: "500m", memory: "512Mi" } },
            },
          ],
          volumes: [{ name: "host", hostPath: { path: "/" } }],
        },
      },
    },
  };
}
