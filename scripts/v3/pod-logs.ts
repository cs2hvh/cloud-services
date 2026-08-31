/**
 * Read a pod's log the way the operator API does.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/pod-logs.ts <namespace> <pod>
 *   node --env-file=.env --env-file=.env.local scripts/v3/pod-logs.ts <ns> <pod> --tail 50
 *
 * Exercises the exact path that app/api/v2/admin/pods/[namespace]/[pod]/logs
 * takes — clamping, RFC 1123 validation, and the previous-container decision —
 * so that chain is proven against a real pod rather than only by unit test.
 * Nothing under app/ can be executed in this repo.
 *
 * READ-ONLY.
 */

import { EXIT_CANNOT_RUN, EXIT_UNTRUSTWORTHY } from "../../lib/paas/telemetry/exit-codes.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import {
  InvalidTargetError,
  buildLogPath,
  clampLogRequest,
  decidePrevious,
  explainEmptyLog,
  isValidK8sName,
  type PodLike,
} from "../../lib/paas/telemetry/runtime-logs.ts";

const [namespace, pod] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!namespace || !pod) {
  console.error("usage: pod-logs.ts <namespace> <pod> [--tail N] [--previous] [--current]");
  process.exit(EXIT_CANNOT_RUN);
}

const tailIdx = process.argv.indexOf("--tail");
const tailLines = tailIdx === -1 ? 40 : Number(process.argv[tailIdx + 1]);

// Validate before any request is built from these values — same order the
// route uses. encodeURIComponent below would defuse a traversal attempt on its
// own, but relying on that makes safety depend on every call site remembering
// to encode.
if (!isValidK8sName(namespace) || !isValidK8sName(pod)) {
  console.error(`refusing: ${!isValidK8sName(namespace) ? "namespace" : "pod"} is not an RFC 1123 name`);
  process.exit(EXIT_UNTRUSTWORTHY);
}

const k = kube(loadKubeconfig(process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml"));

const podObj = await k.get<PodLike>(
  `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}`,
  true,
);
if (!podObj) {
  console.error(`no such pod: ${namespace}/${pod}`);
  process.exit(EXIT_CANNOT_RUN);
}

const decision = decidePrevious(podObj);
const previous = process.argv.includes("--current")
  ? false
  : process.argv.includes("--previous")
    ? true
    : decision.previous;

let resolved;
try {
  resolved = clampLogRequest({ namespace, pod, tailLines, previous });
} catch (e) {
  if (e instanceof InvalidTargetError) {
    console.error(e.message);
    process.exit(EXIT_UNTRUSTWORTHY);
  }
  throw e;
}

console.log(`\n${namespace}/${pod}`);
console.log(`  restarts ${decision.restarts}   crashLooping ${decision.crashLooping}   previous ${resolved.previous}`);
if (resolved.clamped.length) console.log(`  clamped: ${resolved.clamped.join("; ")}`);
if (resolved.previous && decision.reason) console.log(`  ${decision.reason}`);
console.log(`  GET ${buildLogPath(resolved)}`);
console.log("─".repeat(88));

let text = await k.raw<string>({ method: "GET", path: buildLogPath(resolved), allowMissing: true });
if (text === null && resolved.previous) {
  text = await k.raw<string>({
    method: "GET",
    path: buildLogPath({ ...resolved, previous: false }),
    allowMissing: true,
  });
  console.log("(no previous instance; showing current)");
}

const body = typeof text === "string" ? text : "";
if (body.trim() === "") {
  console.log(explainEmptyLog(podObj) ?? "(no output)");
} else {
  console.log(body.trimEnd());
}
console.log("");
