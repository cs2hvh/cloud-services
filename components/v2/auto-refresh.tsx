"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-render a server component on a timer, while something is still happening.
 *
 * The build log page is a server component that reads the log from R2. That is
 * the right shape — no auth hop, no second copy of the sanitiser — but it means
 * the page is a snapshot, and a build takes minutes. Somebody watching their
 * first deploy saw "No build log was stored for this deployment" and no way to
 * tell whether that meant working, broken, or finished.
 *
 * router.refresh() re-runs the server component and patches the result in,
 * keeping scroll position and client state. So the log grows in place.
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
 */
export function AutoRefresh({
  active,
  intervalMs = 5000,
  label,
}: {
  active: boolean;
  intervalMs?: number;
  label?: string;
}) {
  const router = useRouter();
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setTicks((t) => t + 1);
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  if (!active) return null;

  return (
    <p className="text-xs text-white/40">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />
      {label ?? "Live — refreshing every few seconds."}
      {ticks > 0 ? ` Updated ${ticks} time${ticks === 1 ? "" : "s"}.` : ""}
    </p>
  );
}
