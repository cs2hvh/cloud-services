import { cn } from "@/lib/utils";

/**
 * A capability the platform does not have yet, stated plainly.
 *
 * This component exists because of a specific v1 failure: its dashboard
 * advertised auto-scaling, a global CDN, 99.99% uptime, multi-AZ and
 * per-second billing, none of which existed. Where v2 cannot do something, it
 * says so here rather than hiding the control or — worse — showing one that
 * silently does nothing.
 */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "blocked";
  title: string;
  children?: React.ReactNode;
  action?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 border px-4 py-3",
        tone === "blocked"
          ? "border-amber-400/25 bg-amber-400/[0.06]"
          : "border-white/[0.09] bg-white/[0.02]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full",
          tone === "blocked" ? "bg-amber-400" : "bg-white/35"
        )}
      />
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-medium text-white">{title}</p>
        {children && (
          <div className="mt-1 text-[12.5px] leading-[1.6] text-white/55">
            {children}
          </div>
        )}
        {action && (
          <p className="m-0 mt-1.5 text-[12px] text-white/40">{action}</p>
        )}
      </div>
    </div>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-white/[0.09] bg-white/[0.015] px-5 py-12 text-center">
      <p className="m-0 text-[14px] text-white/70">{title}</p>
      {children && (
        <div className="mt-2 text-[13px] leading-[1.6] text-white/40">
          {children}
        </div>
      )}
    </div>
  );
}
