/**
 * Shared presentation for the v2 project pages.
 *
 * Deliberately small and unstyled beyond the essentials — this exists so the
 * pages are readable, not so the product has a design system. It matches the
 * operator page's conventions rather than inventing a second set.
 */

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * A deployment's state, as a word rather than a colour alone.
 *
 * Colour is not the signal — roughly one in twelve men cannot reliably separate
 * the red from the green, and this is the field that says whether a customer's
 * app is up.
 */
export function StateBadge({ state }: { state: string | null }) {
  if (!state) {
    // NOT "failed", and not blank. A project that has never deployed is a
    // different thing from one whose deploy failed, and collapsing them tells a
    // new user their brand-new project is broken.
    return <span className="text-xs text-neutral-500">Never deployed</span>;
  }
  const tone: Record<string, string> = {
    ready: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    canceled: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  };
  const busy = state === "queued" || state === "building" || state === "publishing";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${
        tone[state] ?? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      {busy ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden /> : null}
      {state}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-neutral-300 px-4 py-8 text-center dark:border-neutral-700">
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="mt-1 text-xs text-neutral-500">{children}</div> : null}
    </div>
  );
}

/**
 * An error the user can act on, rather than a blank panel.
 *
 * A page that renders nothing when a read fails is indistinguishable from a
 * page with nothing to show — which is the single failure this project has
 * found most often, and it is worse in a UI than in a log because the user
 * concludes their data is gone.
 */
export function Failed({ what, detail }: { what: string; detail?: string }) {
  return (
    <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm dark:border-red-900 dark:bg-red-950/40">
      <p className="font-medium text-red-900 dark:text-red-200">Could not load {what}.</p>
      <p className="mt-0.5 text-xs text-red-800 dark:text-red-300">
        {detail ?? "This is a problem on our side, not a sign that anything was deleted."}
      </p>
    </div>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}
