/**
 * How each fleet status is presented — pure, so the vocabulary is testable and
 * lives in one place instead of being spread through JSX ternaries.
 *
 * The hard design constraint: `unknown` and `not_deployed` must NOT read as
 * failures. Five red rows for a fleet that simply is not deployed yet would
 * train an operator to ignore the page, which costs more than showing nothing.
 * Only states that need a human are red or amber.
 *
 * Doc: nextstespsAI/21-admin-platform.md (§8).
 */
import type { FleetStatus } from "@/lib/admin/fleet";

export type Tone = "good" | "warn" | "bad" | "muted";

export interface StatusPresentation {
  /** Short label for the badge. */
  label: string;
  tone: Tone;
  /** What this state means, in an operator's words. */
  meaning: string;
  /** The next action, or null when nothing is required. */
  action: string | null;
}

export const STATUS: Record<FleetStatus, StatusPresentation> = {
  working: {
    label: "Working",
    tone: "good",
    meaning: "Jobs are in flight and being touched.",
    action: null,
  },
  idle: {
    label: "Idle",
    tone: "good",
    meaning: "Running and polling, with nothing to do. This is healthy.",
    action: null,
  },
  degraded: {
    label: "Stuck jobs",
    tone: "bad",
    meaning: "Jobs were claimed and then abandoned mid-flight. They will never finish on their own.",
    action: "Reap or requeue the stuck jobs, and find out what killed the worker holding them.",
  },
  backed_up: {
    label: "Backed up",
    tone: "warn",
    meaning: "Work is waiting and nothing has claimed it.",
    action: "Check the worker is running and that its claimer is polling.",
  },
  not_ticking: {
    label: "Not polling",
    tone: "bad",
    meaning:
      "The process answers HTTP but has stopped polling for work. Kubernetes considers it healthy and will not restart it.",
    action: "Restart the pod — a liveness probe will not do it for you.",
  },
  down: {
    label: "Down",
    tone: "bad",
    meaning: "No response from its health endpoint, and it has run jobs before.",
    action: "Check the pod: kubectl -n ahura get pods.",
  },
  not_deployed: {
    label: "Not deployed",
    tone: "muted",
    meaning: "No response and no trace of it ever running. Most likely it was never rolled out.",
    action: "Deploy it, or ignore this row if the runner is not in use yet.",
  },
  unknown: {
    label: "Not checked",
    tone: "muted",
    meaning:
      "Nothing is queued or in flight, and health probing is off — so there is no evidence either way. Not a fault.",
    action: null,
  },
};

/**
 * Why a row is "Not checked" — the static STATUS text is only right for ONE of
 * the two causes.
 *
 * A runner with no /health service (media) lands on `unknown` even when probing
 * is ENABLED, and the generic text then told the operator "health probing is
 * off" on a server where it was on. Observed 2026-07-30.
 */
export function unknownMeaning(probeable: boolean, probingEnabled: boolean): string {
  if (!probeable) {
    return (
      "This job system has no /health endpoint to probe — there is no dedicated worker " +
      "deployment behind it — so its liveness can never be confirmed here. Only its queue " +
      "can be read, and the queue is empty. Not a fault."
    );
  }
  if (!probingEnabled) {
    return STATUS.unknown.meaning;
  }
  return (
    "Nothing is queued or in flight, and its health endpoint was not reached on this check, " +
    "so there is no evidence either way. Not a fault."
  );
}

/** Tailwind classes per tone, matching the dark-glass admin styling. */
export const TONE_CLASS: Record<Tone, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-300",
  muted: "border-white/15 bg-white/5 text-neutral-400",
};

export const DOT_CLASS: Record<Tone, string> = {
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  muted: "bg-neutral-500",
};

/** Rows an operator must act on — drives the "needs attention" count. */
export function needsAttention(status: FleetStatus): boolean {
  return STATUS[status].tone === "bad" || STATUS[status].tone === "warn";
}

/**
 * Warn when a probe run looks like a VANTAGE-POINT problem rather than an outage.
 *
 * The health endpoints are ClusterIP Services, reachable only from inside the
 * cluster. Probing from a laptop therefore reports most of the fleet as "Down" —
 * observed on 2026-07-30, where forcing a probe turned three accurate "Not
 * checked" rows into three false "Down" rows. Showing that without a caveat is
 * worse than not probing at all, so say it out loud.
 *
 * Deliberately requires a MAJORITY of failures: one runner down while the rest
 * answer is a real outage, and must not be explained away.
 */
export function vantageSuspect(statuses: FleetStatus[], probingEnabled: boolean): boolean {
  if (!probingEnabled || statuses.length === 0) return false;
  const unreachable = statuses.filter((s) => s === "down" || s === "not_deployed").length;
  const reachable = statuses.filter((s) => s !== "down" && s !== "not_deployed" && s !== "unknown").length;
  // A MAJORITY of failures points at the observer, not the fleet. One runner down
  // while the rest answer is a real outage and must not be explained away.
  return unreachable >= 2 && unreachable > reachable;
}

export function probeVantageWarning(
  statuses: FleetStatus[],
  probingEnabled: boolean
): string | null {
  if (!vantageSuspect(statuses, probingEnabled)) return null;
  const unreachable = statuses.filter((s) => s === "down" || s === "not_deployed").length;
  return (
    `${unreachable} of ${statuses.length} runners did not answer their health endpoint. ` +
    `Those endpoints are only reachable from inside the cluster, so if you are viewing this from ` +
    `outside it, the rows below are a limit of where you are probing from — not proof of an outage.`
  );
}

/**
 * Which rows an operator should actually act on.
 *
 * When the probe run is vantage-suspect, unreachable rows are NOT counted: the
 * page would otherwise say "not proof of an outage" in the banner while the
 * headline card asserted 4 outages — a self-contradiction observed on 2026-07-30
 * after probing from a laptop.
 *
 * Queue-derived problems (stuck, backed up, claimer not ticking) always count.
 * They come from the database, so where we probed from is irrelevant to them.
 */
export function attentionStatuses(statuses: FleetStatus[], probingEnabled: boolean): FleetStatus[] {
  const suspect = vantageSuspect(statuses, probingEnabled);
  return statuses.filter((s) => {
    if (!needsAttention(s)) return false;
    if (suspect && (s === "down" || s === "not_deployed")) return false;
    return true;
  });
}

/**
 * How many runners we genuinely could not confirm either way.
 *
 * Counts unreachable rows too when the run is vantage-suspect — reporting "2
 * cannot be confirmed" while 5 failed to answer understates what we don't know.
 */
export function unconfirmedCount(statuses: FleetStatus[], probingEnabled: boolean): number {
  const suspect = vantageSuspect(statuses, probingEnabled);
  return statuses.filter(
    (s) => s === "unknown" || s === "not_deployed" || (suspect && s === "down")
  ).length;
}

/** Age of a millisecond gap, for the probe columns. */
export function humanMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Age of an ISO timestamp relative to now, for "last activity". */
export function humanSince(iso: string | null, now: number): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return `${humanMs(Math.max(now - t, 0))} ago`;
}
