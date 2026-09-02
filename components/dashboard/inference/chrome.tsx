"use client";

// Shared design chrome for the Inference dashboard pages — matches the
// editorial canvas language used by Kubernetes / Database (aurora background,
// dotted grid, Nunito accent typography, mono labels, horizontal stat strips,
// status dots with glow, mono uppercase pill buttons).
//
// Keep these in sync with components/dashboard/{kubernetes,database}/*.

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

// ─── Design tokens (must match other services) ─────────────────────
export const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
export const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
export const ACCENT = "#0095FF";
export const ACCENT_BRIGHT = "#33adff";
export const ACCENT_DIM = "rgba(0,149,255,0.08)";

// ─── Page chrome ───────────────────────────────────────────────────

export function PageCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">{children}</div>
    </div>
  );
}

// ─── Hero with optional breadcrumb + actions ───────────────────────

export function Hero({
  breadcrumb,
  title,
  accent,
  caption,
  actions,
  size = "lg",
}: {
  breadcrumb?: { label: string; href: string };
  title: string;
  accent?: string;
  caption?: string;
  actions?: React.ReactNode;
  size?: "lg" | "md";
}) {
  const titleClass =
    size === "lg"
      ? "text-[40px] sm:text-[52px]"
      : "text-[30px] sm:text-[38px]";
  return (
    <header className="mb-14">
      {breadcrumb && (
        <Link
          href={breadcrumb.href}
          className={`${MONO} mb-4 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/45 hover:text-white/80 transition-colors`}
        >
          <ChevronRight className="h-3 w-3 rotate-180" />
          {breadcrumb.label}
        </Link>
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1
            className={`${titleClass} leading-[1.02] tracking-[-0.03em] text-white font-semibold`}
          >
            {title}
            {accent && (
              <>
                {" "}
                <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                  {accent}
                </span>
              </>
            )}
          </h1>
          {caption && (
            <p
              className={`${MONO} mt-4 max-w-md text-[11.5px] text-white/45 leading-relaxed`}
            >
              {caption}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ─── Buttons ───────────────────────────────────────────────────────

export function PrimaryButton({
  children,
  onClick,
  href,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const className = `${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed`;
  const style: React.CSSProperties = {
    background: disabled
      ? "rgba(255,255,255,0.06)"
      : `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
    color: "#ffffff",
    boxShadow: disabled
      ? "none"
      : "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
  };
  const hover = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
    (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
  };
  const leave = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    (e.currentTarget as HTMLElement).style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
    (e.currentTarget as HTMLElement).style.transform = "none";
  };
  if (href) {
    return (
      <Link href={href} className={className} style={style} onMouseEnter={hover} onMouseLeave={leave}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={style}
      onMouseEnter={hover}
      onMouseLeave={leave}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  href,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const className = `${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed`;
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

// Compact action button used in table rows
export function RowActionButton({
  children,
  onClick,
  href,
  variant = "ghost",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "ghost" | "primary" | "danger";
}) {
  const base = `${MONO} inline-flex items-center gap-1.5 h-7 px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors`;
  const className =
    variant === "primary"
      ? `${base} text-white`
      : variant === "danger"
        ? `${base} border border-red-400/20 bg-red-400/[0.04] text-red-300/85 hover:text-red-200 hover:bg-red-400/[0.08]`
        : `${base} border border-white/[0.08] bg-[#0d0e11] text-white/65 hover:text-white hover:bg-white/[0.04]`;
  const style: React.CSSProperties | undefined =
    variant === "primary" ? { background: ACCENT, color: "#fff" } : undefined;
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}

// ─── Section head ──────────────────────────────────────────────────

export function SectionHead({
  title,
  accent,
  link,
  rightMeta,
}: {
  title: string;
  accent?: string;
  link?: { label: string; href: string };
  rightMeta?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {title}
          {accent && (
            <>
              {" "}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                {accent}
              </span>
            </>
          )}
          <span className="text-white/55 font-normal">.</span>
        </h2>
      </div>
      <div className="flex items-center gap-4">
        {rightMeta && (
          <span
            className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 tabular-nums`}
          >
            {rightMeta}
          </span>
        )}
        {link && (
          <Link
            href={link.href}
            className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/50 hover:text-[#0095FF] transition-colors`}
          >
            {link.label}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Stats strip (horizontal, no boxes) ────────────────────────────

export function StatsStrip({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-16 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
      {children}
    </section>
  );
}

export function StatCell({
  label,
  value,
  suffix,
  hint,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="px-5 py-5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className="h-1 w-1 rounded-full shrink-0"
          style={{
            background: accent ?? "rgba(255,255,255,0.55)",
            boxShadow: accent ? `0 0 5px ${accent}` : "none",
          }}
        />
        <span
          className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
        >
          {value}
        </span>
        {suffix && (
          <span style={SERIF_STYLE} className="text-[16px] text-white/40 font-medium">
            {suffix}
          </span>
        )}
      </div>
      <p className={`${MONO} text-[10.5px] text-white/40`}>{hint}</p>
    </div>
  );
}

// ─── Table primitives ──────────────────────────────────────────────

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      {children}
    </div>
  );
}

export function ColHead({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right" | "center";
}) {
  return (
    <div
      className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ─── Status dot ────────────────────────────────────────────────────

export function StatusDot({
  status,
}: {
  status: "ok" | "warn" | "error" | "neutral" | "info";
}) {
  const meta = {
    ok: { color: "#4ade80", label: "" },
    warn: { color: "#fbbf24", label: "" },
    error: { color: "#f87171", label: "" },
    info: { color: ACCENT, label: "" },
    neutral: { color: "rgba(255,255,255,0.4)", label: "" },
  }[status];
  return (
    <span
      className="h-1.5 w-1.5 rounded-full shrink-0"
      style={{
        background: meta.color,
        boxShadow:
          meta.color === "rgba(255,255,255,0.4)" ? "none" : `0 0 5px ${meta.color}`,
      }}
    />
  );
}

export function StatusLabel({
  status,
  children,
}: {
  status: "ok" | "warn" | "error" | "neutral" | "info";
  children: React.ReactNode;
}) {
  const color = {
    ok: "#4ade80",
    warn: "#fbbf24",
    error: "#f87171",
    info: ACCENT,
    neutral: "rgba(255,255,255,0.55)",
  }[status];
  return (
    <span
      className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
      style={{ color }}
    >
      {children}
    </span>
  );
}

// ─── Filter chip ───────────────────────────────────────────────────

export function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MONO} h-7 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors ${
        active
          ? "text-white"
          : "text-white/50 hover:text-white border border-white/[0.06] hover:bg-white/[0.03]"
      }`}
      style={
        active
          ? { background: ACCENT, color: "#fff", boxShadow: "0 0 12px rgba(0,149,255,0.3)" }
          : undefined
      }
    >
      {label}
    </button>
  );
}

// ─── Empty state ───────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-white/[0.08] bg-[#0c0d10] rounded-[6px] px-6 py-16 text-center">
      <h3
        style={SERIF_STYLE}
        className="text-[22px] font-semibold tracking-[-0.02em] text-white/85"
      >
        {title}
      </h3>
      <p
        className={`${MONO} mt-3 mx-auto max-w-md text-[11.5px] text-white/40 leading-relaxed`}
      >
        {description}
      </p>
      {action && <div className="mt-6 flex items-center justify-center">{action}</div>}
    </div>
  );
}

// ─── Code chip (for showing API URLs, key prefixes, etc.) ──────────

export function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <code
      className={`${MONO} inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/80`}
    >
      {children}
    </code>
  );
}

// ─── Floaty CSS keyframes (used by feature illustrations) ──────────

export function FloatyKeyframes() {
  return (
    <style>{`
      @keyframes floaty {
        0%, 100% { transform: translateY(0px); }
        50%      { transform: translateY(-6px); }
      }
    `}</style>
  );
}
