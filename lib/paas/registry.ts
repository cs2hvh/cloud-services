/**
 * Is this image still in the registry?
 *
 * The one question rollback must ask and cannot answer from the database. A
 * deployment row records the digest that was published; it does not know
 * whether the blob still exists. Repointing production at a digest the registry
 * no longer has produces ImagePullBackOff — the rollback reports success, the
 * old pods are replaced, and the site goes down.
 *
 * This is v1's failure with the sharp edge filed off. v1 re-pointed a mutable
 * Docker Hub tag that nothing pruned or guaranteed still existed; v2 pins an
 * immutable digest, which removes the wrong-image problem and leaves the
 * missing-image one exactly where it was.
 *
 * Reached through the apiserver proxy because the registry is a ClusterIP with
 * a node-local proxy — `localhost:5000` resolves on a node and nowhere else.
 */

import type { kube } from "./k8s/client.ts";

/** The client `kube()` returns. That module exports no named type for it. */
type KubeClient = ReturnType<typeof kube>;

/** The media types a v2 registry will answer a manifest request with. */
const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
].join(", ");

const REGISTRY_PROXY = "/api/v1/namespaces/ahura-system/services/registry:5000/proxy/v2";

export type ImagePresence = "present" | "absent" | "unknown";

/**
 * Three states, and the third is why this does not return a boolean.
 *
 * `absent` must block a rollback. `unknown` — the registry could not be
 * reached, the proxy failed, the apiserver said something unexpected — must
 * NOT, because an unreachable registry is not a missing image, and refusing on
 * it means an outage cannot be rolled back at exactly the moment the cluster is
 * unhealthy. The caller decides; it is told which it got.
 *
 * Distinguishing them takes a reachability check: a failed manifest read alone
 * cannot tell "no such digest" from "registry down", and collapsing the two is
 * the same defect in both directions.
 */
export async function imagePresence(
  k: KubeClient,
  repo: string,
  digest: string,
): Promise<{ presence: ImagePresence; detail: string }> {
  if (!digest || !digest.trim() || !digest.startsWith("sha256:")) {
    return { presence: "absent", detail: `not a digest: ${JSON.stringify(digest)}` };
  }

  let manifestFailed: string | null = null;
  try {
    await k.raw({
      method: "GET",
      path: `${REGISTRY_PROXY}/${repo}/manifests/${digest}`,
      headers: { Accept: MANIFEST_ACCEPT },
    });
    return { presence: "present", detail: `${repo}@${digest.slice(0, 19)}… is in the registry` };
  } catch (e) {
    manifestFailed = (e as Error).message.slice(0, 160);
  }

  // The manifest read failed. Before calling that "absent", confirm the
  // registry is answering at all — otherwise a proxy hiccup reads as a pruned
  // image and blocks a rollback during an incident.
  try {
    await k.raw({ method: "GET", path: `${REGISTRY_PROXY}/_catalog` });
  } catch {
    return {
      presence: "unknown",
      detail: `registry did not answer, so nothing can be concluded about ${digest.slice(0, 19)}…`,
    };
  }

  return {
    presence: "absent",
    detail: `registry is up and does not have ${repo}@${digest.slice(0, 19)}… (${manifestFailed})`,
  };
}
