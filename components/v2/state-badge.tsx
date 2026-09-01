import { cn } from "@/lib/utils";

/**
 * Deployment and domain state, rendered honestly.
 *
 * "ready" means the image built. It does NOT mean anything routes to it —
 * that is what an alias decides — so this never says "live". The distinction
 * matters: v1's dashboard showed apps as healthy that were serving nothing.
 */

const DEPLOYMENT_TONE: Record<string, string> = {
  queued: "bg-white/[0.06] text-white/60 border-white/[0.12]",
  building: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  publishing: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  ready: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  error: "bg-rose-400/10 text-rose-300 border-rose-400/30",
  canceled: "bg-white/[0.04] text-white/40 border-white/[0.1]",
};

const DOMAIN_TONE: Record<string, string> = {
  pending: "bg-white/[0.06] text-white/60 border-white/[0.12]",
  verifying: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  active: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  failed: "bg-rose-400/10 text-rose-300 border-rose-400/30",
  removed: "bg-white/[0.04] text-white/40 border-white/[0.1]",
};

export function StateBadge({
  state,
  kind = "deployment",
  className,
}: {
  state: string;
  kind?: "deployment" | "domain";
  className?: string;
}) {
  const tone =
    (kind === "domain" ? DOMAIN_TONE : DEPLOYMENT_TONE)[state] ??
    "bg-white/[0.06] text-white/60 border-white/[0.12]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11.5px] font-medium capitalize",
        tone,
        className
      )}
    >
      {(state === "building" || state === "publishing" || state === "verifying") && (
        <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-current" />
      )}
      {state}
    </span>
  );
}

/** Short, absolute, unambiguous. Relative times lie when a tab sits open. */
export function Timestamp({ value }: { value: string | null }) {
  if (!value) return <span className="text-white/30">—</span>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <span className="text-white/30">—</span>;
  return (
    <time dateTime={value} className="tabular-nums">
      {d.toISOString().replace("T", " ").slice(0, 16)}Z
    </time>
  );
}

export function Duration({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-white/30">—</span>;
  const s = Math.round(ms / 1000);
  if (s < 60) return <span className="tabular-nums">{s}s</span>;
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}m {String(s % 60).padStart(2, "0")}s
    </span>
  );
}

/**
 * Runtime status of a deployment in the cluster.
 *
 * Two rules from lib/paas/replicas, and both are about not lying:
 *
 * - replicas NULL means the cluster could not be read. It must never render as
 *   "0" or "scaled to zero" — that would tell someone their app is
 *   deliberately off when the truth is we could not look.
 * - "running-unrouted" is ready replicas no hostname reaches. It costs money
 *   and serves nothing, and it is the state a promote leaves behind, so it
 *   gets its own colour rather than being folded into "running".
 */
const REPLICA_TONE: Record<string, string> = {
  serving: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  // Asleep is a HEALTHY state for a live app, not a degraded one, so it reads
  // calm rather than warning. It is deliberately not the same colour as
  // scaled-to-zero, which is an old build nobody is serving.
  asleep: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  "running-unrouted": "bg-amber-400/10 text-amber-300 border-amber-400/30",
  "scaled-to-zero": "bg-white/[0.05] text-white/45 border-white/[0.12]",
  "not-ready": "bg-sky-400/10 text-sky-300 border-sky-400/30",
  "not-applied": "bg-white/[0.05] text-white/45 border-white/[0.12]",
  "no-image": "bg-rose-400/10 text-rose-300 border-rose-400/30",
  unknown: "bg-white/[0.04] text-white/35 border-white/[0.1]",
};

const REPLICA_LABEL: Record<string, string> = {
  serving: "Serving",
  // Never "Stopped" and never "0 replicas". This is the user's LIVE app.
  asleep: "Sleeping — wakes on next request",
  "running-unrouted": "Running, unrouted",
  "scaled-to-zero": "Scaled to zero",
  "not-ready": "Not ready",
  "not-applied": "Not applied",
  "no-image": "No image",
  // Never "scaled to zero" and never a replica count — we could not look.
  unknown: "Can't tell",
};

export function ReplicaBadge({
  status,
  replicas,
}: {
  status: string;
  replicas: number | null;
}) {
  const tone = REPLICA_TONE[status] ?? REPLICA_TONE.unknown;
  const label = REPLICA_LABEL[status] ?? "Can't tell";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11.5px] font-medium",
        tone
      )}
      title={
        status === "asleep"
          ? "Idle and scaled to zero on purpose. The next request wakes it, which takes a few seconds."
          : status === "running-unrouted"
          ? "Running, but no address points at it."
          : status === "unknown"
            ? "We could not read this app status just now."
            : undefined
      }
    >
      {label}
      {/* Only ever a real reading. null prints nothing rather than 0. */}
      {replicas !== null && replicas > 0 && (
        <span className="tabular-nums opacity-60">&times;{replicas}</span>
      )}
    </span>
  );
}
