/**
 * Pre-flight validation for BYO Model Deploy.
 *
 * Catches the cheap-to-detect failure modes synchronously at POST time
 * before we ever ask RunPod to provision a worker:
 *  - image is on a registry we can reach
 *  - image manifest exists (right repo, right tag) — for docker source
 *  - HuggingFace repo exists + is downloadable for the org
 *  - Truss repo is a valid git URL
 *
 * The deploy-runner will do a second, deeper validation when it actually
 * spins up the worker (e.g. /healthz responds inside 5min). That's expensive
 * — only happens once we accept the job. This pass is the cheap gate.
 */

const DOCKER_HUB_REGISTRY_BASE = "https://registry-1.docker.io/v2";
const GHCR_REGISTRY_BASE = "https://ghcr.io/v2";

export interface DeployPreflightResult {
  ok: boolean;
  resolved_image_uri: string | null; // canonical pullable URI after resolution
  registry_type: "docker_hub" | "ghcr" | "huggingface" | "git" | "unknown";
  warnings: string[];
  errors: string[];
}

export interface DeployPreflightInput {
  source: "docker" | "huggingface" | "truss";
  source_ref: string;
  source_revision?: string | null;
}

export async function preflightDeployment(
  input: DeployPreflightInput
): Promise<DeployPreflightResult> {
  switch (input.source) {
    case "docker":
      return preflightDockerImage(input);
    case "huggingface":
      return preflightHuggingFace(input);
    case "truss":
      return preflightTrussRepo(input);
    default:
      return fail(input, `Unknown source type "${input.source}"`);
  }
}

// ── Docker image ────────────────────────────────────────────────────

async function preflightDockerImage(
  input: DeployPreflightInput
): Promise<DeployPreflightResult> {
  const parsed = parseDockerRef(input.source_ref);
  if (!parsed) {
    return fail(
      input,
      `Couldn't parse "${input.source_ref}" as a Docker image reference (expected like nginx:1.27 or ghcr.io/org/img:tag)`
    );
  }

  const tag = input.source_revision || parsed.tag;
  const registryBase = parsed.registry === "ghcr.io" ? GHCR_REGISTRY_BASE : DOCKER_HUB_REGISTRY_BASE;
  const registryType: DeployPreflightResult["registry_type"] =
    parsed.registry === "ghcr.io" ? "ghcr" : "docker_hub";

  // For private registries we can't HEAD without creds — only warn, don't block
  let manifestReachable: boolean | null = null;
  try {
    const manifestUrl = `${registryBase}/${parsed.repo}/manifests/${tag}`;
    const resp = await fetch(manifestUrl, {
      method: "HEAD",
      headers: {
        Accept:
          "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
      },
    });
    if (resp.ok) {
      manifestReachable = true;
    } else if (resp.status === 401 || resp.status === 403) {
      manifestReachable = null; // need auth, can't verify
    } else if (resp.status === 404) {
      return fail(
        input,
        `Image manifest not found at ${parsed.registry}/${parsed.repo}:${tag}. Check the tag exists and is pushed.`
      );
    } else {
      manifestReachable = null;
    }
  } catch {
    manifestReachable = null;
  }

  const warnings: string[] = [];
  if (manifestReachable === null) {
    warnings.push(
      `Couldn't verify image manifest at ${parsed.registry}/${parsed.repo}:${tag} without credentials. ` +
        `If this is a private image, make sure RunPod has registry-auth configured (Settings → Container Registry Auth) ` +
        `or push to a public repo.`
    );
  }

  return {
    ok: true,
    resolved_image_uri: `${parsed.registry}/${parsed.repo}:${tag}`,
    registry_type: registryType,
    warnings,
    errors: [],
  };
}

interface ParsedDockerRef {
  registry: string;
  repo: string;
  tag: string;
}

function parseDockerRef(ref: string): ParsedDockerRef | null {
  // Strip leading docker:// or oci:// prefixes
  const cleaned = ref.replace(/^(docker|oci):\/\//, "").trim();
  if (cleaned.length === 0) return null;

  // Split off tag (last :tag, ignoring port colons)
  let tag = "latest";
  let withoutTag = cleaned;
  const lastColon = cleaned.lastIndexOf(":");
  const lastSlash = cleaned.lastIndexOf("/");
  if (lastColon > lastSlash) {
    tag = cleaned.slice(lastColon + 1);
    withoutTag = cleaned.slice(0, lastColon);
  }

  // Detect registry vs library/* fallback
  let registry: string;
  let repo: string;
  const firstSegment = withoutTag.split("/")[0] ?? "";
  if (firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost") {
    registry = firstSegment;
    repo = withoutTag.slice(firstSegment.length + 1);
  } else {
    registry = "docker.io";
    repo = withoutTag.includes("/") ? withoutTag : `library/${withoutTag}`;
  }

  if (!repo || !tag) return null;
  return { registry, repo, tag };
}

// ── HuggingFace ─────────────────────────────────────────────────────

async function preflightHuggingFace(
  input: DeployPreflightInput
): Promise<DeployPreflightResult> {
  // HF refs look like org/model or org/model@revision
  const ref = input.source_ref.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(ref)) {
    return fail(
      input,
      `"${ref}" doesn't look like a HuggingFace model id (expected "org/model")`
    );
  }

  const warnings: string[] = [];
  try {
    const apiUrl = `https://huggingface.co/api/models/${encodeURIComponent(ref)}`;
    const resp = await fetch(apiUrl, { method: "GET" });
    if (resp.status === 404) {
      return fail(input, `HuggingFace model ${ref} not found.`);
    }
    if (resp.status === 401 || resp.status === 403) {
      warnings.push(
        `HuggingFace says ${ref} is gated. You'll need to provision HF_TOKEN with read access on the deploy worker (Settings → Secrets).`
      );
    } else if (!resp.ok) {
      warnings.push(
        `HuggingFace API returned ${resp.status} when probing ${ref}. Continuing — the deploy worker will retry.`
      );
    }
  } catch (err) {
    warnings.push(
      `Couldn't reach HuggingFace API: ${err instanceof Error ? err.message : String(err)}. Continuing.`
    );
  }

  return {
    ok: true,
    resolved_image_uri: null,
    registry_type: "huggingface",
    warnings,
    errors: [],
  };
}

// ── Truss / git ─────────────────────────────────────────────────────

async function preflightTrussRepo(
  input: DeployPreflightInput
): Promise<DeployPreflightResult> {
  // Accept https://github.com/owner/repo[.git] or git@github.com:owner/repo[.git]
  const ref = input.source_ref.trim();
  const httpsMatch = ref.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  const sshMatch = ref.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!httpsMatch && !sshMatch) {
    return fail(
      input,
      `"${ref}" doesn't look like a git URL (expected https://host/owner/repo or git@host:owner/repo)`
    );
  }

  // For public GitHub we can probe the repo API
  const warnings: string[] = [];
  if (httpsMatch && httpsMatch[1].toLowerCase() === "github.com") {
    const owner = httpsMatch[2];
    const repo = httpsMatch[3];
    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const resp = await fetch(apiUrl, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (resp.status === 404) {
        return fail(
          input,
          `GitHub repo ${owner}/${repo} not found (or private — public Truss repos only in v1).`
        );
      }
      if (!resp.ok) {
        warnings.push(`GitHub API returned ${resp.status} when probing ${owner}/${repo}. Continuing.`);
      }
    } catch (err) {
      warnings.push(
        `Couldn't reach GitHub API: ${err instanceof Error ? err.message : String(err)}. Continuing.`
      );
    }
  } else {
    warnings.push(
      `Non-GitHub git host detected. Make sure the repo is publicly cloneable from inside the build worker.`
    );
  }

  return {
    ok: true,
    resolved_image_uri: null,
    registry_type: "git",
    warnings,
    errors: [],
  };
}

// ── helpers ─────────────────────────────────────────────────────────

function fail(input: DeployPreflightInput, err: string): DeployPreflightResult {
  return {
    ok: false,
    resolved_image_uri: null,
    registry_type: registryTypeFromSource(input.source),
    warnings: [],
    errors: [err],
  };
}

function registryTypeFromSource(
  source: DeployPreflightInput["source"]
): DeployPreflightResult["registry_type"] {
  if (source === "huggingface") return "huggingface";
  if (source === "truss") return "git";
  return "unknown";
}
