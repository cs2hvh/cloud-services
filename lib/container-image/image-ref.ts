/**
 * Shared Docker image reference helpers.
 *
 * Used by:
 *   - lib/app-operations/integrations/container-registry.adapter.ts
 *   - lib/services/build-polling.ts
 *   - app/api/services/platform-apps/rollback/route.ts
 */

/**
 * Build a fully-qualified image reference from a tag and optional digest.
 *
 * @example
 * buildImageRef("hav0ky/myapp:3", "sha256:abc123") // "hav0ky/myapp:3@sha256:abc123"
 * buildImageRef("hav0ky/myapp:3", null)            // "hav0ky/myapp:3"
 */
export function buildImageRef(
  imageTag?: string | null,
  imageDigest?: string | null,
): string | null {
  const tag = imageTag?.trim();
  // Strip any accidental leading '@' from digest (defense-in-depth for existing DB rows)
  const digest = imageDigest?.trim().replace(/^@+/, "");

  if (tag && digest && !tag.includes("@")) {
    return `${tag}@${digest}`;
  }

  if (tag) return tag;

  return null;
}

export interface ParsedImageRef {
  /** Repository name without tag or digest, e.g. "hav0ky/myapp" */
  repository: string;
  /** Tag or digest reference, e.g. "3" or "sha256:abc123" */
  reference: string;
}

/**
 * Split a fully-qualified image reference into repository + reference parts.
 *
 * Handles:
 *   - "repo:tag"
 *   - "repo:tag@sha256:..."
 *   - "repo:tag@@sha256:..."  (double-@ from stale DB rows)
 *   - "docker.io/repo:tag"   (Kubernetes-normalized prefix)
 *
 * @example
 * parseImageRef("hav0ky/myapp:3@sha256:abc")
 * // { repository: "hav0ky/myapp", reference: "sha256:abc" }
 */
export function parseImageRef(imageRef: string): ParsedImageRef | null {
  // Strip docker.io/ prefix that Kubernetes adds to short image refs
  const trimmed = imageRef.trim().replace(/^docker\.io\//, "");
  if (!trimmed) return null;

  const digestIndex = trimmed.indexOf("@");
  if (digestIndex >= 0) {
    let repoWithTag = trimmed.slice(0, digestIndex);
    let reference = trimmed.slice(digestIndex + 1);

    // Strip accidental leading @ (digest stored with @ prefix produces double @@)
    if (reference.startsWith("@")) {
      reference = reference.slice(1);
    }

    // Strip :tag from repo part so the repository is a bare name, e.g. "repo:2" -> "repo"
    const lastColon = repoWithTag.lastIndexOf(":");
    if (lastColon > repoWithTag.lastIndexOf("/")) {
      repoWithTag = repoWithTag.slice(0, lastColon);
    }

    return { repository: repoWithTag, reference };
  }

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > trimmed.lastIndexOf("/")) {
    return {
      repository: trimmed.slice(0, lastColon),
      reference: trimmed.slice(lastColon + 1),
    };
  }

  return { repository: trimmed, reference: "latest" };
}

/**
 * Extract the digest portion from a raw Kubernetes imageID string.
 *
 * @example
 * extractDigestFromImageID("docker-pullable://docker.io/hav0ky/myapp@sha256:abc123")
 * // "sha256:abc123"
 */
export function extractDigestFromImageID(imageID?: string | null): string | null {
  if (!imageID) return null;
  const match = imageID.match(/sha256:[a-f0-9]+$/i);
  return match?.[0] ?? null;
}
