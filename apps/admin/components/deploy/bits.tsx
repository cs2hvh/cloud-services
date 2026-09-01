import { cn } from "@/lib/utils";
import { STATUS, type StatusTone } from "@admin/lib/chart-theme";

/** Section card matching the panel's house surfaces. Server-safe. */
export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A section whose upstream (Linode, Cloudflare, the cluster) was unreachable. */
export function Unavailable({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
      <strong className="font-semibold">Unavailable.</strong> {error}
    </div>
  );
}

const CHIP_TONE: Record<string, StatusTone> = {
  // drift/finding statuses across the reconcilers
  clean: "good",
  healthy: "good",
  recorded: "good",
  routed: "good",
  unaccounted: "critical",
  phantom: "warning",
  orphaned: "serious",
  claimable: "critical",
  stale: "warning",
  foreign: "neutral",
  reclaimable: "serious",
  // drift_observations kinds not already covered above
  unrecorded: "critical",
  denied: "serious",
  unpriced: "warning",
  expired: "warning",
  resolved: "good",
  open: "warning",
  live: "good",
  exhausted: "neutral",
  deleted: "neutral",
  arrears: "serious",
  completed: "good",
  pending: "warning",
  running: "good",
  stopped: "warning",
  provisioning: "neutral",
  terminated: "neutral",
  available: "good",
  low: "warning",
  drift: "critical",
  unmetered: "critical",
  unbillable: "critical",
  // signal severities
  critical: "critical",
  warn: "warning",
  info: "neutral",
  // sweep statuses
  "never-succeeded": "critical",
  failing: "critical",
  overdue: "serious",
  "never-scheduled": "warning",
  suspended: "warning",
  // queue states
  error: "critical",
  queued: "warning",
  building: "neutral",
  publishing: "neutral",
  ready: "good",
};

/** Status chip — tone carried by color AND the literal status text. */
export function StatusChip({ status }: { status: string }) {
  const tone = CHIP_TONE[status] ?? "neutral";
  return (
    <span
      className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
      style={{ color: STATUS[tone] }}
    >
      {status}
    </span>
  );
}

/** One drift finding / signal row. */
export function FindingRow({
  status,
  label,
  detail,
  action,
  aside,
}: {
  status: string;
  label: string;
  detail: string;
  action?: string;
  aside?: string;
}) {
  return (
    <li className="border-t border-border/60 py-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <StatusChip status={status} />
        <span className="font-mono text-sm">{label}</span>
        {aside && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {aside}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {action && (
        <p className="mt-1 text-xs text-muted-foreground/70">→ {action}</p>
      )}
    </li>
  );
}

/** Inline callout for a warning that applies to a whole section. */
export function Callout({
  tone,
  children,
}: {
  tone: "warning" | "critical";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "mb-3 rounded-md border p-2 text-xs",
        tone === "critical"
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300",
      )}
    >
      {children}
    </p>
  );
}

export const money = (n: number, places = 2) => `$${n.toFixed(places)}`;

export const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : `${(n / 1024 ** 2).toFixed(0)} MB`;

export const seconds = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : s >= 60
      ? `${Math.floor(s / 60)}m ${s % 60}s`
      : `${s}s`;

/** Table primitives so every section's table reads the same. */
export function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="pb-1.5 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">{children}</tbody>
      </table>
    </div>
  );
}
