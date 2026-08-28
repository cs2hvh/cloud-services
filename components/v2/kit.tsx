/**
 * The v2 design kit.
 *
 * WHY THIS EXISTS. The v2 pages were built to prove the platform worked, and
 * they were styled with `bg-white dark:bg-neutral-950` — a light/dark neutral
 * scheme. The dashboard shell they render inside is a FIXED dark surface
 * (app/dashboard/layout.tsx):
 *
 *     page bg  #0c0d11   card bg  #15171c   border  white/[0.07]
 *
 * So every v2 surface fought the shell it sat in: neutral greys on slate, and
 * borders a shade the rest of the product never uses. It read as scaffolding
 * because it WAS scaffolding, and no amount of feature work fixes that.
 *
 * Everything here is one layer above the page, in the same language v1 already
 * speaks: white at low alpha for surfaces and text, lucide for icons, one
 * primary action per view rendered in white-on-black.
 *
 * OPACITY IS THE TYPE SCALE. There is no separate muted colour — text is
 * white/90 for primary, white/60 for secondary, white/40 for tertiary. Three
 * steps, used consistently, is what makes a dense operational page readable;
 * a fourth invented per page is what makes it look assembled.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";

/* ── page furniture ─────────────────────────────────────────────────────── */

/**
 * The top of every v2 page.
 *
 * `back` is a link rather than history.back(): someone who lands here from a
 * deploy notification has no history to go back to, and a button that does
 * nothing on first load is worse than no button.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {back ? (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
        >
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
          {description ? <div className="mt-1 text-sm text-white/50">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** A surface one step above the page. */
export function Card({
  title,
  subtitle,
  actions,
  icon: Icon,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-white/[0.07] bg-[#15171c]",
        className,
      )}
    >
      {title ? (
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-medium text-white/90">
              {Icon ? <Icon className="h-3.5 w-3.5 text-white/40" aria-hidden /> : null}
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-white/40">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── actions ────────────────────────────────────────────────────────────── */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

const BUTTON_VARIANTS = {
  // One per view. v1 renders the primary action white-on-black and nothing else
  // competes with it.
  primary: "bg-white text-black hover:bg-white/90",
  secondary: "border border-white/[0.12] bg-white/[0.04] text-white/90 hover:bg-white/[0.08]",
  ghost: "text-white/60 hover:bg-white/[0.06] hover:text-white/90",
  // Destructive actions are outlined, not filled. A solid red button is the
  // easiest thing on a page to hit by accident, and everything it does here is
  // hard to undo.
  danger: "border border-red-500/30 bg-red-500/[0.06] text-red-300 hover:bg-red-500/[0.12]",
} as const;

const BUTTON_SIZES = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5",
} as const;

export function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = "secondary",
  size: keyof typeof BUTTON_SIZES = "md",
  className?: string,
) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

/* ── data display ───────────────────────────────────────────────────────── */

/** A single figure. `hint` explains what it does NOT include. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "bad" | "good";
}) {
  const toneClass = {
    default: "text-white",
    good: "text-emerald-300",
    warn: "text-amber-300",
    bad: "text-red-300",
  }[tone];
  return (
    <div className="min-w-[7rem]">
      <p className="text-[11px] uppercase tracking-wider text-white/35">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-white/30">{hint}</p> : null}
    </div>
  );
}

/** Label/value pairs. Values are monospace so refs and digests line up. */
export function Facts({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-white/35">{f.label}</dt>
          <dd className="mt-0.5 truncate font-mono text-xs text-white/80">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Deployment state.
 *
 * NULL IS ITS OWN STATE, not an error and not a failure: a project that has
 * never deployed is a normal new project, and colouring it red would tell a
 * customer something is broken on the day they signed up.
 */
export function StateBadge({ state, className }: { state: string | null; className?: string }) {
  if (!state) {
    return <span className={cn("text-xs text-white/35", className)}>Never deployed</span>;
  }

  const busy = state === "queued" || state === "building" || state === "publishing";
  const tone =
    state === "ready"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : state === "error"
        ? "border-red-500/25 bg-red-500/10 text-red-300"
        : busy
          ? "border-sky-500/25 bg-sky-500/10 text-sky-300"
          : "border-white/[0.12] bg-white/[0.05] text-white/60";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize",
        tone,
        className,
      )}
    >
      {busy ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden /> : null}
      {state}
    </span>
  );
}

/** An external link that looks like one. */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-sky-300 transition-colors hover:text-sky-200"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </a>
  );
}

/* ── states ─────────────────────────────────────────────────────────────── */

/**
 * Nothing here — and why that is fine.
 *
 * An empty state carries the next action. A dashed box saying "no projects"
 * with nothing to click is where a new customer stops.
 */
export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/[0.09] px-6 py-10 text-center">
      {Icon ? <Icon className="mx-auto mb-3 h-6 w-6 text-white/20" aria-hidden /> : null}
      <p className="text-sm font-medium text-white/80">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-md text-xs text-white/40">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * A read that failed.
 *
 * DELIBERATELY NOT AN EMPTY STATE. "You have no projects" and "we could not
 * load your projects" look identical if you render both as an empty list, and
 * the first thing a customer does on seeing the wrong one is create everything
 * again.
 */
export function Failed({ what, detail }: { what: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium text-red-200">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Could not load {what}.
      </p>
      <p className="mt-1 text-xs text-red-300/70">
        {detail ?? "This is a read failure, not an empty result — nothing has been lost."}
      </p>
    </div>
  );
}

/* ── formatting ─────────────────────────────────────────────────────────── */

/**
 * Relative time, or "unknown" — never a wrong absolute date.
 *
 * An unparseable timestamp returns "unknown" rather than the Unix epoch, which
 * is what `new Date(null)` renders and reads as a real date from 1970.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown";
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* ── page shell ─────────────────────────────────────────────────────────── */

export const V2_MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
export const V2_ACCENT = "#0095FF";
export const V2_SERIF: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};

/**
 * The page frame every v2 surface sits in.
 *
 * WHY IT IS NOT JUST A max-w WRAPPER. The v2 pages were a centred column on the
 * dashboard's flat background, so the space either side read as dead margin —
 * "spaces on left and right unlike other services". The service pages are the
 * same width; what makes them feel edge to edge is that the BACKGROUND is
 * full bleed and the content column sits on top of it. Two soft accent glows
 * and a 28px dot grid, exactly as /dashboard/services/apps renders them, so the
 * eye reads one continuous surface rather than a card floating in a gap.
 *
 * FULL BLEED, no max width. It was capped at max-w-7xl, which is 1280px, and on
 * a wide monitor that left a visible gutter down both sides while every
 * neighbouring service ran edge to edge — kubernetes has no cap at all. A
 * hostname column and a deployment table both want the room, and a page that is
 * narrower than the one beside it reads as a different product.
 *
 * The background is pointer-events-none and z-0 so it can never intercept a
 * click meant for the content above it.
 */
/**
 * The figures strip, and the section heading under it.
 *
 * COPIED IN SHAPE FROM kubernetes AND database ON PURPOSE. Those two pages set
 * the convention for a service landing page in this dashboard — a full-bleed
 * row bounded by hairlines, four cells divided by verticals, each a bullet, a
 * label, a large figure and one line saying what the figure counts. The apps
 * page had a small rounded box with three numbers in it, which read as a
 * different product sitting in the same sidebar.
 *
 * The cells are DIVIDED, not boxed. A box inside a box is the thing the rest of
 * this dashboard spent its design budget avoiding.
 */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-14 grid grid-cols-2 divide-x divide-white/[0.06] border-y border-white/[0.06] lg:grid-cols-4">
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
  /** What the figure counts. Without it a number is a number. */
  hint: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 px-5 py-5">
      <div className="flex items-center gap-2">
        <span
          className="h-1 w-1 shrink-0 rounded-full"
          style={{
            background: accent ?? "rgba(255,255,255,0.55)",
            boxShadow: accent ? `0 0 5px ${accent}` : "none",
          }}
        />
        <span
          className={`${V2_MONO} text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        {/* tabular-nums so a figure changing from 9 to 10 does not shift the row. */}
        <span className="text-[40px] font-bold leading-none tracking-[-0.035em] tabular-nums text-white">
          {value}
        </span>
        {suffix ? <span className="text-[16px] font-medium text-white/40">{suffix}</span> : null}
      </div>
      <p className={`${V2_MONO} text-[10.5px] text-white/40`}>{hint}</p>
    </div>
  );
}

/** The heading that introduces a section, as kubernetes and database write it. */
export function SectionHead({
  eyebrow,
  title,
  accent,
  rightMeta,
}: {
  eyebrow?: string;
  title: string;
  accent: string;
  rightMeta?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p
            className={`${V2_MONO} mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/45`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {title} <span className="font-normal text-[#0095FF]">{accent}</span>
          <span className="font-normal text-white/55">.</span>
        </h2>
      </div>
      {rightMeta ? (
        <span
          className={`${V2_MONO} text-[10.5px] uppercase tracking-[0.12em] tabular-nums text-white/45`}
        >
          {rightMeta}
        </span>
      ) : null}
    </div>
  );
}

export function ServiceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -right-[200px] -top-[300px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)" }}
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
      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
        {children}
      </div>
    </div>
  );
}

/**
 * The big statement at the top of a section's landing page.
 *
 * Matches /dashboard/services/apps: a large tracking-tight line with the second
 * half set in the serif face and the accent colour, a mono sub-line, and the
 * one primary action. The split is `lead` + `accent` rather than a parsed
 * string because guessing where to break a sentence is how you get a heading
 * that reads correctly in English and nowhere else.
 */
export function Hero({
  lead,
  accent,
  description,
  action,
}: {
  lead: string;
  accent: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-10 sm:mb-14">
      <div className="max-w-2xl">
        <h1 className="text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-[52px]">
          {lead}{" "}
          <span style={{ ...V2_SERIF, color: V2_ACCENT }} className="font-normal">
            {accent}
          </span>
          <span className="text-white/55">.</span>
        </h1>
        {description ? (
          <p className={`${V2_MONO} mt-4 max-w-md text-[11.5px] leading-relaxed text-white/45`}>
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-6 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}

/**
 * The primary call to action, in the accent gradient the services pages use.
 *
 * A class rather than a component with hover handlers: the services page drives
 * its hover from onMouseEnter/onMouseLeave, which makes that button unusable
 * from a server component. CSS does the same job and works before hydration.
 */
export const heroButtonClass =
  "inline-flex h-10 items-center gap-2 rounded-[5px] px-4 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white transition-all " +
  "bg-[linear-gradient(135deg,#0095FF,#0066B3)] shadow-[0_8px_20px_rgba(0,149,255,0.20),inset_0_1px_0_rgba(255,255,255,0.15)] " +
  "hover:bg-[linear-gradient(135deg,#33adff,#0095FF)] hover:-translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0095FF]/40";

/* ── list table ─────────────────────────────────────────────────────────── */

/**
 * A column heading, in the compute list's voice.
 *
 * Mono, 10px, wide tracking, uppercase — the same treatment
 * /dashboard/services/compute/vps uses, so a customer moving between servers
 * and applications reads the same table twice rather than two designs.
 */
export function ColHead({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={cn(
        V2_MONO,
        "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The frame around a grid table.
 *
 * A GRID, NOT A <table>, and that is what the compute list does too. The header
 * is `hidden md:grid` and each row is `grid-cols-1 md:grid-cols-[…]`, so the
 * whole thing collapses to stacked rows on a phone. A real table cannot do
 * that without either a horizontal scrollbar or a second markup path.
 *
 * `columns` is passed once and applied to both the header and every row by the
 * caller. Two copies of a grid template is how a column header ends up over the
 * wrong column.
 */
export function ListTable({
  head,
  children,
  empty,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#111216]">
      <div className="hidden border-b border-white/[0.06] px-5 py-2.5 md:block">{head}</div>
      {empty ?? children}
    </div>
  );
}

/** The grid template shared by the projects table's header and rows. */
export const PROJECT_COLUMNS =
  "grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)]";
