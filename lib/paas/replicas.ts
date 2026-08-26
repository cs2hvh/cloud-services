/**
 * Replica facts for a project's deployments.
 *
 * WHY THIS EXISTS
 *
 * The dashboard could not tell three very different things apart, because from
 * the database they look identical — a `ready` row that is not the one the
 * alias points at:
 *
 *   - superseded but kept, scaled to zero → rollback is a SCALE-UP, seconds
 *   - never applied to the cluster        → rollback is a re-apply
 *   - built but the image is unreachable  → rollback will fail, and the only
 *                                           honest thing to show is that
 *
 * Showing all three as "ready" invites a user to promote something that will
 * not come back. Showing them all as "deleted" hides working rollback targets.
 *
 * WHY IT TAKES ROWS INSTEAD OF READING THEM
 *
 * Master's rule, which is better than my original design: elevate the
 * OPERATION, never the authorization DECISION, and never do a tenant-scoped
 * read or write with the service role.
 *
 * Reading the Kubernetes API genuinely requires elevation — there is no tenant
 * credential for a cluster. Reading paas.deployments does not: the caller has
 * RLS and should use it. So this function is given the rows the caller was
 * already allowed to see, and answers only the question that needs a cluster.
 * It cannot leak another team's deployments because it is never told about
 * them, and that is a structural property rather than a careful one.
 */

import { kube, loadKubeconfig } from "./k8s/client.ts";

/** What the caller must supply per deployment — exactly what an RLS read returns. */
export interface DeploymentFact {
  ref: string;
  state: string;
  image_digest: string | null;
  /**
   * Non-null means asleep ON PURPOSE — idle, at zero replicas, and waking on
   * the next request. Optional so existing callers keep working, but pass it:
   * without it a sleeping production app is indistinguishable from a
   * superseded old build, and a user shown "stopped" for their live app will
   * reasonably conclude it is broken.
   */
  scaled_to_zero_at?: string | null;
}

export type ReplicaStatus =
  /** The alias points here and at least one replica is ready. */
  | "serving"
  /** Object kept at zero replicas. Rollback is a scale-up. */
  | "scaled-to-zero"
  /**
   * Zero replicas DELIBERATELY: idle, still the live target for its hostname,
   * and woken by the next request. Distinct from `scaled-to-zero`, which is a
   * superseded old build. Rendering the two the same shows someone's live
   * production app as "stopped".
   */
  | "asleep"
  /** Object exists, replicas wanted, none ready yet — deploying or broken. */
  | "not-ready"
  /**
   * Ready replicas, but the alias points elsewhere. Costs money and serves no
   * traffic — the state that makes warm fraction 1.0 and the one a promote
   * leaves behind if nothing scales it down.
   */
  | "running-unrouted"
  /** No Kubernetes object. Rollback means re-applying from the recorded image. */
  | "not-applied"
  /** The build never produced a runnable image. */
  | "no-image"
  /** The cluster could not be reached. NOT the same as absent. */
  | "unknown";

export interface ReplicaState {
  ref: string;
  status: ReplicaStatus;
  /** Desired replicas, or null when the cluster could not be read. */
  replicas: number | null;
  /** Ready replicas, or null when the cluster could not be read. */
  readyReplicas: number | null;
  /**
   * Whether traffic can be pointed here without rebuilding.
   *
   * This is the control plane's BELIEF, not a guarantee: it means the build
   * succeeded and recorded an image, so a rollback has something to run. It
   * does NOT verify the image is still present in the registry — that would be
   * a registry round trip per deployment per page load. A UI should say
   * "rollback available", never "rollback guaranteed".
   */
  rollable: boolean;
}

interface LiveScale {
  replicas: number;
  readyReplicas: number;
}

/**
 * Read replica facts for deployments the caller is already authorized to see.
 *
 * `servingRef` is the deployment the project's alias currently points at, which
 * the caller also knows from its own read. It is what separates "serving" from
 * "an old build that happens to still have replicas".
 *
 * On cluster failure this returns `unknown` with null counts rather than zeros.
 * A zero would render as "scaled to zero" — telling the user their app is
 * intentionally off when in fact we could not look. That is the same class of
 * bug as v1 returning ciphertext when it could not decrypt: never emit a
 * plausible value in place of an unknown one.
 */
export async function replicaStates(
  projectRef: string,
  facts: DeploymentFact[],
  opts: {
    servingRef?: string | null;
    kubeconfigPath?: string;
    /** Injectable for tests; defaults to a client built from the kubeconfig. */
    client?: { get: <T>(path: string, tolerateMissing?: boolean) => Promise<T | null> };
  } = {},
): Promise<ReplicaState[]> {
  if (facts.length === 0) return [];

  const ns = `app-${projectRef}`;

  let k = opts.client ?? null;
  if (!k) {
    try {
      const path = opts.kubeconfigPath ?? process.env.V2_KUBECONFIG;
      if (!path) throw new Error("no kubeconfig configured");
      k = kube(loadKubeconfig(path));
    } catch {
      // Cannot reach the cluster at all — every row is unknown, not absent.
      return facts.map((f) => unknownState(f));
    }
  }

  const live = await Promise.all(
    facts.map(async (f): Promise<LiveScale | null | "error"> => {
      try {
        const dep = await k!.get<{
          spec?: { replicas?: number };
          status?: { readyReplicas?: number };
        }>(`/apis/apps/v1/namespaces/${ns}/deployments/${f.ref}`, true);
        if (!dep) return null; // genuinely absent — a 404 we asked to tolerate
        return {
          replicas: dep.spec?.replicas ?? 0,
          readyReplicas: dep.status?.readyReplicas ?? 0,
        };
      } catch {
        // A transport or auth failure is NOT a 404. Distinguishing them is the
        // whole point: absent means rollback re-applies, error means we do not
        // know and must not claim.
        return "error";
      }
    }),
  );

  return facts.map((f, i) => {
    const rollable = f.state === "ready" && f.image_digest != null;
    const scale = live[i];

    if (scale === "error") return { ...unknownState(f), rollable };

    if (f.state !== "ready" && f.image_digest == null) {
      return { ref: f.ref, status: "no-image", replicas: scale?.replicas ?? null, readyReplicas: scale?.readyReplicas ?? null, rollable: false };
    }

    if (scale == null) {
      return { ref: f.ref, status: "not-applied", replicas: 0, readyReplicas: 0, rollable };
    }

    // Order matters. A deployment with ready replicas that is NOT the alias
    // target is not "serving" — nothing routes to it. Collapsing the two is how
    // an operator concludes an app is fine while its hostname returns 502.
    // Asleep is checked FIRST and independently of replica count. The wake path
    // scales the pod up before the reconciler clears the flag, so there is a
    // window where the app is both marked asleep and running — reporting it as
    // "serving" there would be true of the pod and wrong about what the
    // control plane is about to do.
    let status: ReplicaStatus;
    if (f.scaled_to_zero_at != null) status = "asleep";
    else if (scale.replicas === 0) status = "scaled-to-zero";
    else if (scale.readyReplicas === 0) status = "not-ready";
    else if (opts.servingRef === f.ref) status = "serving";
    else status = "running-unrouted";

    return { ref: f.ref, status, replicas: scale.replicas, readyReplicas: scale.readyReplicas, rollable };
  });
}

function unknownState(f: DeploymentFact): ReplicaState {
  return {
    ref: f.ref,
    status: "unknown",
    replicas: null,
    readyReplicas: null,
    rollable: f.state === "ready" && f.image_digest != null,
  };
}
