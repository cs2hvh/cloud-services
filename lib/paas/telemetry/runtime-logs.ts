/**
 * Runtime logs — a tenant's pod output, read through the Kubernetes API.
 *
 * Two things v1 got right here, carried over deliberately:
 *
 *   Server-side clamping. Whatever the query string asks for, the server
 *   decides. `tailLines=50000000` against a chatty pod is a memory exhaustion
 *   vector aimed at the control plane, and it arrives looking like an ordinary
 *   request from a legitimate customer.
 *
 *   Previous-container logs when the pod has restarted. A crash-looping
 *   container's CURRENT log is nearly empty — it just started. The output that
 *   explains the crash belongs to the instance that died, which the API only
 *   returns for `previous=true`. Without this, the log view for a crash-loop
 *   shows a few lines of startup and nothing else, and the one failure mode a
 *   customer most needs to debug is the one they cannot see.
 *
 * And one thing v1 did not have to worry about, because it had no multi-tenant
 * namespacing: THESE VALUES GO INTO AN API PATH. `/api/v1/namespaces/{ns}/
 * pods/{name}/log` with an unvalidated `ns` is a path-traversal surface into
 * the rest of the Kubernetes API, reached with the platform's own credentials.
 * Both identifiers are validated against RFC 1123 before they are interpolated,
 * and the validation is an allowlist of the character set Kubernetes itself
 * permits — not a denylist of `..` and `/`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE FOR ANY TENANT-FACING CALLER. Read this before wiring a customer log
 * view to this module.
 *
 * A TENANT PATH MUST NEVER TAKE A NAMESPACE FROM THE CALLER. Resolve the
 * deployment ref through the RLS-scoped client, and derive the namespace from
 * the row you got back. Validation here proves a string is a legal Kubernetes
 * name; it cannot prove the caller is entitled to that name, and
 * `app-prj-someone-else` is a perfectly legal one.
 *
 * `app/api/v2/admin/pods/[namespace]/[pod]/logs` does accept a namespace, and
 * that is only safe because it is operator-scoped: it reaches every namespace
 * by design and sits behind the admin gate. Copying its shape into a tenant
 * route reproduces v1's confirmed IDOR with better input validation.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure. No network. The caller does the fetching; this decides what to ask for.
 */

/** Nothing above this, whatever the caller asks. */
export const MAX_TAIL_LINES = 5_000;
export const DEFAULT_TAIL_LINES = 200;

/** Seven days. Beyond this the kubelet has almost certainly rotated it away. */
export const MAX_SINCE_SECONDS = 7 * 24 * 3600;

/** Hard ceiling on the response body, independent of line count. */
export const MAX_LOG_BYTES = 2 * 1024 * 1024;

/**
 * RFC 1123 label, which is what Kubernetes requires of namespace names and
 * generates for pod names: lowercase alphanumerics and hyphens, starting and
 * ending alphanumeric, at most 63 characters.
 *
 * Anchored, and an allowlist. A denylist that rejects ".." and "/" would still
 * admit "%2e%2e%2f", a null byte, a newline splitting the request, or a
 * unicode character that normalises to a separator downstream.
 */
const RFC1123 = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** Pod names are a label plus generated suffixes; still one DNS label overall. */
export function isValidK8sName(name: string): boolean {
  return typeof name === "string" && name.length > 0 && name.length <= 63 && RFC1123.test(name);
}

export class InvalidTargetError extends Error {
  field: string;
  constructor(field: string, value: string) {
    super(
      `[paas/telemetry] refusing to build a Kubernetes path: ${field} ` +
        `${JSON.stringify(value.slice(0, 40))} is not an RFC 1123 name`,
    );
    this.name = "InvalidTargetError";
    this.field = field;
  }
}

export interface LogRequest {
  namespace: string;
  pod: string;
  container?: string;
  /** Lines from the end. Clamped to MAX_TAIL_LINES. */
  tailLines?: number;
  /** Only entries newer than this. Clamped to MAX_SINCE_SECONDS. */
  sinceSeconds?: number;
  /** Read the previous container instance rather than the current one. */
  previous?: boolean;
  timestamps?: boolean;
}

export interface ResolvedLogRequest {
  namespace: string;
  pod: string;
  container?: string;
  tailLines: number;
  sinceSeconds?: number;
  previous: boolean;
  timestamps: boolean;
  /** Set when the caller asked for more than they were given. */
  clamped: string[];
}

/**
 * Apply the server's limits to whatever the caller asked for.
 *
 * Clamps rather than rejects, deliberately. A client asking for a million
 * lines gets MAX_TAIL_LINES and a note saying so; erroring instead just moves
 * the problem into the UI, and a log view that refuses to render because a
 * default was too large is worse than one that shows the last 5,000 lines.
 */
export function clampLogRequest(req: LogRequest): ResolvedLogRequest {
  if (!isValidK8sName(req.namespace)) throw new InvalidTargetError("namespace", String(req.namespace));
  if (!isValidK8sName(req.pod)) throw new InvalidTargetError("pod", String(req.pod));
  if (req.container !== undefined && !isValidK8sName(req.container)) {
    throw new InvalidTargetError("container", String(req.container));
  }

  const clamped: string[] = [];

  let tailLines = Math.trunc(Number(req.tailLines ?? DEFAULT_TAIL_LINES));
  if (!Number.isFinite(tailLines) || tailLines < 1) {
    tailLines = DEFAULT_TAIL_LINES;
  } else if (tailLines > MAX_TAIL_LINES) {
    tailLines = MAX_TAIL_LINES;
    clamped.push(`tailLines reduced to ${MAX_TAIL_LINES}`);
  }

  let sinceSeconds: number | undefined;
  if (req.sinceSeconds !== undefined) {
    const s = Math.trunc(Number(req.sinceSeconds));
    if (Number.isFinite(s) && s > 0) {
      sinceSeconds = Math.min(s, MAX_SINCE_SECONDS);
      if (s > MAX_SINCE_SECONDS) clamped.push(`sinceSeconds reduced to ${MAX_SINCE_SECONDS}`);
    }
  }

  return {
    namespace: req.namespace,
    pod: req.pod,
    container: req.container,
    tailLines,
    sinceSeconds,
    previous: req.previous === true,
    timestamps: req.timestamps !== false,
    clamped,
  };
}

/**
 * The Kubernetes API path for a resolved request.
 *
 * Every interpolated segment has already passed isValidK8sName, and query
 * values are all numbers or booleans this module produced. Nothing
 * caller-supplied reaches the path as free text.
 */
export function buildLogPath(r: ResolvedLogRequest): string {
  const q = new URLSearchParams();
  q.set("tailLines", String(r.tailLines));
  q.set("timestamps", String(r.timestamps));
  if (r.sinceSeconds !== undefined) q.set("sinceSeconds", String(r.sinceSeconds));
  if (r.previous) q.set("previous", "true");
  if (r.container) q.set("container", r.container);
  // limitBytes is the kubelet's own ceiling and is enforced regardless of
  // tailLines — a pod emitting megabyte lines defeats a line count.
  q.set("limitBytes", String(MAX_LOG_BYTES));

  return `/api/v1/namespaces/${r.namespace}/pods/${r.pod}/log?${q.toString()}`;
}

// ── deciding which container instance to read ───────────────────────────────

export interface ContainerStatusLike {
  name: string;
  ready?: boolean;
  restartCount?: number;
  state?: {
    waiting?: { reason?: string; message?: string };
    running?: { startedAt?: string };
    terminated?: { reason?: string; exitCode?: number; finishedAt?: string };
  };
  lastState?: {
    terminated?: { reason?: string; exitCode?: number; finishedAt?: string };
  };
}

export interface PodLike {
  metadata: { name: string; namespace?: string };
  status?: {
    phase?: string;
    containerStatuses?: ContainerStatusLike[];
  };
}

export interface PreviousDecision {
  /** Fetch the previous container instance as well as, or instead of, current. */
  previous: boolean;
  /** Shown to the reader so the log view can explain what it is showing. */
  reason: string;
  /** Total restarts across the pod's containers. */
  restarts: number;
  /** Set when the pod is in a recognised crash loop. */
  crashLooping: boolean;
}

/**
 * Whether the previous container's logs are the ones worth reading.
 *
 * The rule: if anything has restarted, the interesting output is in the
 * instance that died. A running container that has restarted 12 times shows a
 * healthy-looking log; its predecessor holds the stack trace.
 */
export function decidePrevious(pod: PodLike): PreviousDecision {
  const statuses = pod.status?.containerStatuses ?? [];
  const restarts = statuses.reduce((n, c) => n + (c.restartCount ?? 0), 0);

  const waiting = statuses.find((c) => c.state?.waiting?.reason);
  const waitReason = waiting?.state?.waiting?.reason;
  const crashLooping = waitReason === "CrashLoopBackOff";

  if (crashLooping) {
    return {
      previous: true,
      // CrashLoopBackOff, OOMKilled and the rest are Kubernetes' words for our
      // own scheduler. They name nothing the reader can act on and nothing they
      // chose, so the state is described instead of quoted.
      reason:
        "This instance is starting and failing repeatedly. These are the logs " +
        "from the run that failed — the current one has only just started.",
      restarts,
      crashLooping: true,
    };
  }

  const terminated = statuses.find((c) => c.lastState?.terminated);
  if (restarts > 0 && terminated) {
    const t = terminated.lastState!.terminated!;
    const how =
      t.reason === "OOMKilled"
        ? "ran out of memory"
        : `stopped with exit code ${t.exitCode ?? "unknown"}`;
    return {
      previous: true,
      reason:
        `This instance has restarted ${restarts} time${restarts === 1 ? "" : "s"}. The ` +
        `previous run ${how}; these are its logs.`,
      restarts,
      crashLooping: false,
    };
  }

  if (restarts > 0) {
    return {
      previous: true,
      reason: `This instance has restarted ${restarts} time${restarts === 1 ? "" : "s"}. These are the logs from the previous run.`,
      restarts,
      crashLooping: false,
    };
  }

  return { previous: false, reason: "", restarts: 0, crashLooping: false };
}

/**
 * A pod that has never started produces no logs, and the reason lives in its
 * status rather than its output. Saying "no logs yet" when the real answer is
 * ImagePullBackOff wastes the customer's afternoon.
 */
export function explainEmptyLog(pod: PodLike): string | null {
  const phase = pod.status?.phase;
  const statuses = pod.status?.containerStatuses ?? [];
  const waiting = statuses.find((c) => c.state?.waiting?.reason)?.state?.waiting;

  if (waiting?.reason) {
    /*
      DESCRIBED, NOT QUOTED. These keys are Kubernetes' vocabulary for our own
      infrastructure. Leading with the raw reason — "ImagePullBackOff — the
      image could not be pulled" — asks the reader to learn our substrate before
      they can read their own error, and the code is the half they cannot act on.

      An unrecognised reason still returns a SENTENCE, never null. Falling
      through to null would render a blocked app as an ordinary quiet one, which
      is the failure this whole function exists to prevent — and it would do it
      precisely for the states nobody has seen before. The raw reason is dropped
      rather than printed, because it is ours and the reader cannot act on it;
      it stays in our telemetry where support can find it.
    */
    const known: Record<string, string> = {
      ImagePullBackOff: "The application image could not be loaded. The build may not have finished publishing it.",
      ErrImagePull: "The application image could not be loaded. The build may not have finished publishing it.",
      CreateContainerConfigError:
        "The application could not be configured to start — usually a missing environment variable.",
      CrashLoopBackOff: "The application started and stopped repeatedly.",
      ContainerCreating: "The application is still being prepared.",
    };
    return known[waiting.reason] ?? "This app has not started. Contact support if it stays this way.";
  }

  if (phase === "Pending") {
    // "Unschedulable" and "Insufficient memory" are true and are OURS. What the
    // reader needs is that the delay is on our side and not their code.
    return "Waiting for capacity — no server is available to start this app yet.";
  }

  return null;
}
