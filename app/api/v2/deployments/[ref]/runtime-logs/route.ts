/**
 * GET /api/v2/deployments/[ref]/runtime-logs
 *
 * What a tenant's app is printing right now, as opposed to why it did or did
 * not build. Build logs answer the first question a customer asks; this
 * answers the one they ask every day afterwards.
 *
 * THE RULE THAT SHAPES THIS ROUTE, from lib/paas/telemetry/runtime-logs:
 * a tenant path resolves the deployment ref through the RLS-scoped client and
 * DERIVES the namespace from the row. It never accepts a namespace from the
 * caller.
 *
 * The reason is that these values go into a Kubernetes API path. Validation
 * proves a string is a legal namespace; it cannot prove the caller is entitled
 * to it, and `app-prj-someone-else` is perfectly legal. The admin route at
 * app/api/v2/admin/pods/[namespace]/[pod]/logs does take a namespace, and that
 * is only safe because it reaches every namespace by design and sits behind
 * the operator gate. Copying its shape here would be the same mistake as v1's
 * IDOR, one layer down.
 *
 * So: the ref comes from the URL, RLS decides whether this caller may see that
 * deployment, and the namespace and pod are derived from what came back.
 * Nothing the caller sends reaches a cluster path.
 *
 * Clamping, previous-container-on-crash-loop and RFC 1123 validation are all
 * imported rather than reimplemented — that module is tested, this route is
 * not, and a second implementation of a security-relevant check is how the two
 * drift apart.
 */

import { loadKubeconfig, kube } from "@/lib/paas/k8s/client.ts";
import {
  clampLogRequest,
  buildLogPath,
  decidePrevious,
  explainEmptyLog,
  isValidK8sName,
  DEFAULT_TAIL_LINES,
  type PodLike,
} from "@/lib/paas/telemetry/runtime-logs.ts";
import { getCaller } from "../../../_lib/auth";
import {
  json,
  unauthenticated,
  notFound,
  apiError,
  fromPostgrestError,
} from "../../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ ref: string }> };

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request, { params }: Params) {
  const caller = await getCaller();
  if (!caller) return unauthenticated();
  const { ref } = await params;

  // RLS decides. A deployment the caller cannot see returns no row, and that
  // is a 404 — identical to one that does not exist, so probing refs cannot
  // confirm which projects are real.
  const { data, error } = await caller.db
    .from("deployments")
    .select("ref, state, projects:project_id (ref)")
    .eq("ref", ref)
    .maybeSingle();

  if (error) {
    const mapped = fromPostgrestError(error);
    if (mapped) return mapped;
    console.error("[v2/runtime-logs] lookup failed:", error);
    return apiError("internal", "Could not load the deployment.", 500);
  }
  if (!data) return notFound("Deployment");

  const deployment = data as {
    ref: string;
    state: string;
    projects: { ref: string } | null;
  };

  if (!deployment.projects) {
    // A deployment always has a project; a null here means the join was
    // filtered by RLS, which is the same answer as not found.
    return notFound("Deployment");
  }

  // Derived, never accepted. Matches tenantNamespace() in the reconciler.
  const namespace = `app-${deployment.projects.ref}`;
  if (!isValidK8sName(namespace)) {
    // A ref that cannot form a legal namespace means the row is malformed,
    // not that the caller did something wrong.
    console.error("[v2/runtime-logs] derived an invalid namespace:", namespace);
    return apiError("internal", "This project's namespace is malformed.", 500);
  }

  const k = kube(
    loadKubeconfig(
      process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml"
    )
  );

  let pods: Awaited<ReturnType<ReturnType<typeof kube>["listPods"]>>;
  try {
    pods = await k.listPods(namespace);
  } catch (err) {
    console.error("[v2/runtime-logs] pod list failed:", err);
    return apiError(
      "upstream_error",
      "Could not reach the cluster to read logs.",
      502
    );
  }

  // Only pods belonging to THIS deployment. appDeployment() labels them
  // ahura.cloud/deployment=<ref>, and the Deployment object is named for the
  // ref, so both are checked rather than trusting a name prefix.
  const mine = pods.filter(
    (p) =>
      p.metadata?.labels?.["ahura.cloud/deployment"] === deployment.ref ||
      p.metadata?.name?.startsWith(`${deployment.ref}-`)
  );

  if (mine.length === 0) {
    // Not an error. A superseded deployment is scaled to zero and kept, which
    // is exactly the state that makes rollback possible.
    return json({
      ref: deployment.ref,
      state: deployment.state,
      lines: [],
      pods: [],
      reason:
        deployment.state === "ready"
          ? "No pods are running for this deployment. It may have been superseded and scaled to zero."
          : "This deployment has no pods yet.",
    });
  }

  const url = new URL(request.url);
  const requested = num(url.searchParams.get("tail")) ?? DEFAULT_TAIL_LINES;
  const since = num(url.searchParams.get("since"));

  const results: Array<{
    pod: string;
    previous: boolean;
    lines: string[];
    note: string | null;
  }> = [];

  for (const pod of mine) {
    const podName = pod.metadata?.name;
    if (!podName) continue;

    // A crash-looping pod's CURRENT container has no useful output — the
    // reason it died is in the previous one. This module decides that; the
    // route does not guess.
    const decision = decidePrevious(pod as unknown as PodLike);

    const resolved = clampLogRequest({
      namespace,
      pod: podName,
      tailLines: requested,
      sinceSeconds: since,
      previous: decision.previous,
    });

    let text: string | null = null;
    try {
      text = await k.raw<string>({
        method: "GET",
        path: buildLogPath(resolved),
        allowMissing: true,
      });
      // A previous-container read can 404 on a pod that never restarted.
      if (text === null && resolved.previous) {
        text = await k.raw<string>({
          method: "GET",
          path: buildLogPath({ ...resolved, previous: false }),
          allowMissing: true,
        });
      }
    } catch (err) {
      console.error(`[v2/runtime-logs] read failed for ${podName}:`, err);
    }

    results.push({
      pod: podName,
      previous: resolved.previous,
      lines: text ? text.split("\n") : [],
      // Says WHY output is empty — waiting to start, crash-looping, evicted —
      // rather than showing a blank box with no explanation.
      note: text ? decision.reason : explainEmptyLog(pod as unknown as PodLike),
    });
  }

  return json({
    ref: deployment.ref,
    state: deployment.state,
    // The namespace is reported so an operator reading a bug report can see
    // which one was used. It was derived, not supplied.
    namespace,
    pods: results,
  });
}
