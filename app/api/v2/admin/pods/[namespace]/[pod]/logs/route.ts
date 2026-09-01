/**
 * GET /api/v2/admin/pods/{namespace}/{pod}/logs
 *
 * An operator reading any pod's log, including a crash-looping one.
 *
 * OPERATOR-SCOPED ON PURPOSE, AND SEPARATE FROM THE TENANT VIEW. This reaches
 * any namespace, so it is behind the admin gate and nothing else. The
 * tenant-facing equivalent must resolve a deployment ref through RLS and derive
 * the namespace from the row — never take a namespace from the caller. The
 * shared logic lives in lib/paas/telemetry/runtime-logs.ts so both paths clamp
 * and validate identically.
 *
 * Both path segments are validated against RFC 1123 before they are
 * interpolated into `/api/v1/namespaces/{ns}/pods/{name}/log`. Without that,
 * this route is path traversal into the rest of the Kubernetes API using the
 * platform's own credentials — and an allowlist is used rather than a denylist
 * of ".." and "/", which would still admit %2e%2e%2f, a null byte, or a newline.
 *
 * When the pod has restarted, the PREVIOUS container's log is returned by
 * default. A crash-looping container's current log is nearly empty because it
 * just started; the output explaining the crash belongs to the instance that
 * died. `?previous=false` overrides.
 */

import { paasConfig } from "@/lib/paas/config";
import { loadKubeconfig, kube } from "@/lib/paas/k8s/client";
import {
  InvalidTargetError,
  buildLogPath,
  clampLogRequest,
  decidePrevious,
  explainEmptyLog,
  isValidK8sName,
  type PodLike,
} from "@/lib/paas/telemetry/runtime-logs";
import { invalid, json } from "../../../../../_lib/http";
import { adminNotFound, getOperator, upstreamFailed } from "../../../../_lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function num(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ namespace: string; pod: string }> },
) {
  const operator = await getOperator();
  if (!operator) return adminNotFound();

  const { namespace, pod } = await context.params;
  const url = new URL(request.url);

  // Validate BEFORE any call is made with these values. encodeURIComponent on
  // the lookup below would neutralise a traversal attempt on its own, but that
  // is defence in depth, not the control — it depends on every future call site
  // remembering to encode. Refusing the value outright means no request is ever
  // built from caller-controlled text, in this route or any that copies it.
  if (!isValidK8sName(namespace) || !isValidK8sName(pod)) return adminNotFound();

  try {
    const k = kube(loadKubeconfig(paasConfig.kubeconfigPath()));

    // Read the pod: it decides whether the previous instance is the one worth
    // showing, and it holds the reason an empty log is empty.
    const podObj = await k.get<PodLike>(
      `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}`,
      true,
    );
    if (!podObj) return adminNotFound();

    const decision = decidePrevious(podObj);
    const explicit = url.searchParams.get("previous");
    const previous = explicit === null ? decision.previous : explicit === "true";

    const resolved = clampLogRequest({
      namespace,
      pod,
      container: url.searchParams.get("container") ?? undefined,
      tailLines: num(url.searchParams.get("tailLines")),
      sinceSeconds: num(url.searchParams.get("sinceSeconds")),
      previous,
      timestamps: url.searchParams.get("timestamps") !== "false",
    });

    // A pod that has never run has no previous instance; asking for one is a
    // 400 from the API, not an empty log. Fall back rather than surfacing that.
    let text = await k.raw<string>({ method: "GET", path: buildLogPath(resolved), allowMissing: true });
    let servedPrevious = resolved.previous;
    if (text === null && resolved.previous) {
      text = await k.raw<string>({
        method: "GET",
        path: buildLogPath({ ...resolved, previous: false }),
        allowMissing: true,
      });
      servedPrevious = false;
    }

    const body = typeof text === "string" ? text : "";

    return json({
      namespace,
      pod,
      previous: servedPrevious,
      restarts: decision.restarts,
      crashLooping: decision.crashLooping,
      /** Shown above the log so the reader knows which instance this is. */
      notice: servedPrevious ? decision.reason : "",
      /** Why the log is empty, when the answer is in the pod's status. */
      emptyReason: body.trim() === "" ? explainEmptyLog(podObj) : null,
      clamped: resolved.clamped,
      lines: body === "" ? [] : body.split(/\r?\n/),
    });
  } catch (e) {
    if (e instanceof InvalidTargetError) return invalid(e.message);
    return upstreamFailed((e as Error).message);
  }
}
