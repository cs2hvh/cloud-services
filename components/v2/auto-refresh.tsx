"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-render a server component on a timer, while something is still happening.
 *
 * The build log page is a server component that reads the log from R2. That is
 * the right shape — no auth hop, no second copy of the sanitiser — but it means
 * the page is a snapshot, and a build takes minutes.
 *
 * router.refresh() re-runs the server component and patches the result in,
 * keeping scroll position and client state, so the log grows in place.
 *
 * IT STOPS ON ITS OWN. `active` goes false the moment the deployment reaches a
 * terminal state, because a page that polls forever is a page that quietly
 * costs a request every few seconds on every open tab for the rest of the day.
 *
 * The VM re-uploads the whole scrubbed log every few seconds (see
 * lib/paas/build/vm.ts), so each refresh shows more of it. Nothing is streamed
 * to the browser directly: the log is redacted on the machine that produced it,
 * and a socket straight from a build VM to a customer's browser would be a
 * route around that.
 *
 * IT SAYS ALMOST NOTHING, ON PURPOSE. This used to read "Live — refreshing
 * every few seconds. Updated 9 times." A running counter is the page talking
 * about its own implementation: nobody deploying an app needs to know how many
 * times a component re-rendered, and it draws the eye away from the log it sits
 * above. A spinner says "working" and takes no words to do it.
 */
export function AutoRefresh({
  active,
  intervalMs = 5000,
  label,
}: {
  active: boolean;
  intervalMs?: number;
  /** Two or three words at most. Omit unless the context is ambiguous. */
  label?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  if (!active) return null;

  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-white/35">
      <Spinner />
      {label ?? "Live"}
    </span>
  );
}

/**
 * A one-element spinner.
 *
 * `animate-spin` on a ring with one transparent quadrant — no SVG, no library,
 * and it inherits currentColor so it works wherever it is dropped. Hidden from
 * assistive tech: the state it indicates is already stated in the text beside
 * it, and a screen reader announcing a permanent "loading" is noise.
 *
 * Motion is suppressed under prefers-reduced-motion by Tailwind's own variant,
 * leaving a static ring rather than nothing — the affordance survives, the
 * movement does not.
 */
export function Spinner({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className} inline-block shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none`}
    />
  );
}
