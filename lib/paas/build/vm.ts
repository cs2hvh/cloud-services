/**
 * Build VM controller.
 *
 * THE ISOLATION MODEL, stated plainly:
 *
 * Linode has no nested virtualisation on any instance family and sells no bare
 * metal, so Kata, Firecracker and every in-cluster microVM design are closed to
 * us. Renting a WHOLE Linode per build buys the same property from the other
 * direction: the tenant boundary becomes Linode's own hypervisor, the same one
 * that separates Linode's customers from each other.
 *
 * What a build VM holds:
 *   - one tenant's source
 *   - one 1-hour GitHub installation token, contents:read, ONE repository
 *   - three presigned R2 URLs, each for exactly one object key
 *
 * What it does NOT hold — every one of these was in v1's build container:
 *   - a kubeconfig (v1 exported KUBECONFIG at pipeline scope into the same
 *     stage that executed customer repository contents: cluster-wide RCE from
 *     an ordinary user account)
 *   - registry push credentials (v1 wrote Docker Hub creds to
 *     ~/.docker/config.json, giving any build write access to every other
 *     app's image repository)
 *   - any route to the cluster
 *   - any other tenant's build cache
 *
 * The VM pushes nothing. It writes an OCI tarball to R2 and dies. A trusted
 * in-cluster publisher scans and pushes it. That seam is what keeps a
 * compromised build from planting an image.
 */

import { randomBytes } from "node:crypto";
import { instances, type Instance } from "../linode/client.ts";
import { presign, r2Keys, getObject } from "./r2.ts";
import { paasConfig } from "../config.ts";

/** Tag on every build VM, so orphans are findable even with no DB record. */
export const BUILD_VM_TAG = "ahura-v2-build";

/** Cheapest shape that builds without thrashing: 2 vCPU / 4GB, ~$0.036/hr. */
export const BUILD_VM_TYPE = "g6-standard-2";

/** Hard ceiling on a build. Past this the reaper destroys the VM regardless. */
export const BUILD_TIMEOUT_MS = 20 * 60_000;

export interface BuildRequest {
  deploymentRef: string;
  cloneUrl: string;
  gitRef: string;
  gitSha: string;
  /** null when the repository supplies its own Dockerfile. */
  dockerfile: string | null;
  rootDirectory?: string | null;
  imageName: string;
  /** Public-prefixed build args only. Server secrets never reach a build. */
  buildArgs?: Record<string, string>;
}

export interface BuildResult {
  status: "success" | "failure";
  imageDigest?: string;
  error?: string;
  finishedAt: string;
}

/**
 * The shell body is kept as a plain array of lines with @@PLACEHOLDER@@ tokens
 * rather than a template literal. Shell `${VAR}` and JS `${expr}` are the same
 * syntax, so mixing them silently turns shell variables into JS interpolation —
 * exactly the class of confusion that produced v1's injection bugs. Here the
 * two never meet: substitution happens once, explicitly, at the end.
 */
const CLOUD_INIT_LINES: string[] = [
  "#!/bin/bash",
  "set -uo pipefail",
  "exec > >(tee -a /var/log/ahura-build.log) 2>&1",
  'echo "=== ahura build @@REF@@ ==="',
  "date -u +%FT%TZ",
  "",
  "STATUS=failure",
  "DIGEST=''",
  "ERR=''",
  "",
  "finish() {",
  "  date -u +%FT%TZ",
  '  echo "=== finishing: status=$STATUS ==="',
  "  # Upload the log first so a failure is always explainable.",
  "  curl -sS -X PUT --data-binary @/var/log/ahura-build.log \\",
  "    -H 'Content-Type: text/plain' '@@LOG_PUT@@' || true",
  "  python3 - <<'PYEOF' > /tmp/meta.json",
  "import json, os",
  "print(json.dumps({",
  "  'status': os.environ.get('STATUS', 'failure'),",
  "  'imageDigest': os.environ.get('DIGEST', ''),",
  "  'error': os.environ.get('ERR', ''),",
  "  'finishedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z',",
  "}))",
  "PYEOF",
  "  curl -sS -X PUT --data-binary @/tmp/meta.json \\",
  "    -H 'Content-Type: application/json' '@@META_PUT@@' || true",
  "  # Power off. The controller destroys the instance; this only stops the clock.",
  "  shutdown -h now",
  "}",
  "export STATUS DIGEST ERR",
  "trap finish EXIT",
  "",
  'fail() { ERR="$1"; STATUS=failure; export ERR STATUS; echo "ERROR: $1"; exit 1; }',
  "",
  "export DEBIAN_FRONTEND=noninteractive",
  "apt-get update -qq || fail 'apt update failed'",
  "apt-get install -y -qq --no-install-recommends git curl ca-certificates python3 uidmap >/dev/null || fail 'package install failed'",
  "",
  "# BuildKit, rootless. The daemon is single-use and dies with the VM.",
  "BUILDKIT_VERSION=v0.16.0",
  'curl -fsSL "https://github.com/moby/buildkit/releases/download/${BUILDKIT_VERSION}/buildkit-${BUILDKIT_VERSION}.linux-amd64.tar.gz" | tar -xz -C /usr/local || fail "buildkit download failed"',
  "",
  "useradd -m -s /bin/bash builder || true",
  "mkdir -p /home/builder/src && chown -R builder:builder /home/builder",
  "",
  "# Clone. The URL carries a 1-hour, single-repo, read-only installation token",
  "# for private repositories, and nothing at all for public ones.",
  "echo '--- clone ---'",
  "sudo -u builder git -c protocol.version=2 clone --depth=1 --branch '@@GIT_REF@@' '@@CLONE_URL@@' /home/builder/src || fail 'git clone failed'",
  "",
  "cd '/home/builder/src@@ROOT_DIR@@' || fail 'root directory not found in repository'",
  "sudo -u builder git rev-parse HEAD",
  "",
  "# The Dockerfile arrives base64-encoded, so no repository content and no",
  "# framework string is ever interpolated into a shell token.",
  "@@DOCKERFILE_BLOCK@@",
  "echo '--- Dockerfile ---'",
  'cat "$DOCKERFILE"',
  "",
  "echo '@@BUILD_ARGS_B64@@' | base64 -d > /tmp/buildargs.env",
  "BUILD_ARG_FLAGS=''",
  "while IFS= read -r line; do",
  '  [ -z "$line" ] && continue',
  '  BUILD_ARG_FLAGS="$BUILD_ARG_FLAGS --opt build-arg:$line"',
  "done < /tmp/buildargs.env",
  "",
  "echo '--- build ---'",
  "buildkitd --oci-worker=true --containerd-worker=false >/var/log/buildkitd.log 2>&1 &",
  "for i in $(seq 1 40); do buildctl debug workers >/dev/null 2>&1 && break; sleep 1; done",
  "buildctl debug workers >/dev/null 2>&1 || fail 'buildkitd did not start'",
  "",
  "buildctl build \\",
  "  --frontend dockerfile.v0 \\",
  "  --local context=. \\",
  "  --local dockerfile=. \\",
  '  --opt filename="$DOCKERFILE" \\',
  "  $BUILD_ARG_FLAGS \\",
  "  --output type=oci,dest=/tmp/image.tar,name='@@IMAGE_NAME@@' \\",
  "  --metadata-file /tmp/buildkit-meta.json || fail 'image build failed'",
  "",
  "DIGEST=$(python3 -c \"import json;print(json.load(open('/tmp/buildkit-meta.json')).get('containerimage.digest',''))\" 2>/dev/null || echo '')",
  "export DIGEST",
  'echo "digest: $DIGEST"',
  "[ -s /tmp/image.tar ] || fail 'build produced no image'",
  "",
  "echo '--- upload ---'",
  "curl -fsS -X PUT --data-binary @/tmp/image.tar -H 'Content-Type: application/octet-stream' '@@IMAGE_PUT@@' || fail 'image upload failed'",
  "",
  "STATUS=success",
  "export STATUS",
  "echo 'build complete'",
  "exit 0",
  "",
];

export function renderCloudInit(
  req: BuildRequest,
  urls: { imagePut: string; logPut: string; metaPut: string },
): string {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

  const dockerfileBlock = req.dockerfile
    ? [
        `echo '${b64(req.dockerfile)}' | base64 -d > Dockerfile.ahura || fail 'could not write Dockerfile'`,
        "DOCKERFILE=Dockerfile.ahura",
      ].join("\n")
    : [
        "DOCKERFILE=Dockerfile",
        "[ -f Dockerfile ] || fail 'repository was detected as Dockerfile-based but none was found'",
      ].join("\n");

  const buildArgsB64 = b64(
    Object.entries(req.buildArgs ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );

  const rootDir = req.rootDirectory ? `/${req.rootDirectory.replace(/^\/+|\/+$/g, "")}` : "";

  const subs: Record<string, string> = {
    "@@REF@@": req.deploymentRef,
    "@@LOG_PUT@@": urls.logPut,
    "@@META_PUT@@": urls.metaPut,
    "@@IMAGE_PUT@@": urls.imagePut,
    "@@GIT_REF@@": req.gitRef,
    "@@CLONE_URL@@": req.cloneUrl,
    "@@ROOT_DIR@@": rootDir,
    "@@DOCKERFILE_BLOCK@@": dockerfileBlock,
    "@@BUILD_ARGS_B64@@": buildArgsB64,
    "@@IMAGE_NAME@@": req.imageName,
  };

  // Every substituted value lands inside single quotes in the script, so a
  // literal single quote would break out. Refuse rather than escape: these
  // fields are already charset-constrained at the database layer, so a quote
  // here means something upstream is wrong.
  for (const [token, value] of Object.entries(subs)) {
    if (token === "@@DOCKERFILE_BLOCK@@" || token === "@@BUILD_ARGS_B64@@") continue;
    if (value.includes("'")) {
      throw new Error(`[build/vm] refusing to render: ${token} contains a single quote`);
    }
  }

  let out = CLOUD_INIT_LINES.join("\n");
  for (const [token, value] of Object.entries(subs)) {
    out = out.split(token).join(value);
  }
  return out;
}


export interface LeasedVm {
  linodeId: number;
  label: string;
  expiresAt: Date;
}

/**
 * Create a build VM. The instance is tagged so the reaper can find it even if
 * the control plane forgets it exists — which is exactly the failure that
 * leaked an instance during credential verification.
 */
export async function leaseBuildVm(req: BuildRequest): Promise<LeasedVm> {
  const urls = {
    imagePut: presign("PUT", r2Keys.imageTar(req.deploymentRef), 3600),
    logPut: presign("PUT", r2Keys.buildLog(req.deploymentRef), 3600),
    metaPut: presign("PUT", r2Keys.buildMeta(req.deploymentRef), 3600),
  };

  const userData = Buffer.from(renderCloudInit(req, urls), "utf8").toString("base64");
  const label = `bld-${req.deploymentRef.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24)}`;

  const instance: Instance = await instances.create({
    region: paasConfig.linode.region(),
    type: BUILD_VM_TYPE,
    label,
    image: "linode/ubuntu24.04",
    // Long random password, never used: no SSH key is installed and the VM is
    // destroyed within minutes.
    root_pass: `${randomBytes(24).toString("base64url")}Aa1!`,
    booted: true,
    tags: [BUILD_VM_TAG, `dpl:${req.deploymentRef}`],
    metadata: { user_data: userData },
    private_ip: false,
  });

  return {
    linodeId: instance.id,
    label: instance.label,
    expiresAt: new Date(Date.now() + BUILD_TIMEOUT_MS),
  };
}

/** Poll R2 for the meta object the VM writes as its last act. */
export async function pollBuildResult(
  deploymentRef: string,
  opts: { timeoutMs?: number; intervalMs?: number; onTick?: (elapsedMs: number) => void } = {},
): Promise<BuildResult | null> {
  const timeout = opts.timeoutMs ?? BUILD_TIMEOUT_MS;
  const interval = opts.intervalMs ?? 15_000;
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const meta = await getObject(r2Keys.buildMeta(deploymentRef));
    if (meta) {
      try {
        const parsed = JSON.parse(meta.toString("utf8")) as BuildResult;
        return parsed;
      } catch {
        // Half-written object; try again next tick.
      }
    }
    opts.onTick?.(Date.now() - started);
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

export async function destroyBuildVm(linodeId: number): Promise<void> {
  await instances.delete(linodeId);
}

/**
 * Destroy every build VM past its deadline.
 *
 * Keyed on the Linode tag, not on database state, so it still works when the
 * control plane has no record of why an instance exists. This is deliberately
 * the last line of defence against paying for leaked build VMs forever.
 */
export async function reapExpiredBuildVms(
  maxAgeMs = BUILD_TIMEOUT_MS,
): Promise<Array<{ linodeId: number; label: string; ageMs: number }>> {
  const all = await instances.listByTag(BUILD_VM_TAG);
  const now = Date.now();
  const reaped: Array<{ linodeId: number; label: string; ageMs: number }> = [];

  for (const vm of all) {
    const age = now - new Date(vm.created).getTime();
    if (age <= maxAgeMs) continue;
    try {
      await instances.delete(vm.id);
      reaped.push({ linodeId: vm.id, label: vm.label, ageMs: age });
    } catch {
      // Leave it for the next sweep rather than aborting the whole reap.
    }
  }
  return reaped;
}
