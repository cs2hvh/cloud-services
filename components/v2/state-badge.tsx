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
