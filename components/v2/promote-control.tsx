"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Promote / rollback.
 *
 * Both directions are one update of aliases.deployment_id — no rebuild, no
 * retag, no new image. That is why rollback is instant and why the control
 * offers any ready deployment rather than only the previous one: "roll back"
 * and "promote" are the same operation, and the UI should not pretend
 * otherwise by hiding forward moves behind a different button.
 *
 * The button text says what actually happens. Until the routing reconciler
 * lands, this changes which deployment the alias records; traffic follows
 * afterwards. Saying "Promoted" would be the same class of claim as v1's
 * dashboard reporting 99.99% uptime it never measured.
 */

export interface PromotableDeployment {
  ref: string;
  shortSha: string;
  message: string | null;
  readyAt: string | null;
}

export function PromoteControl({
  projectRef,
  aliasRef,
  hostname,
  currentDeploymentRef,
  candidates,
  routingLive,
}: {
  projectRef: string;
  aliasRef: string;
  hostname: string;
  currentDeploymentRef: string | null;
  candidates: PromotableDeployment[];
  /**
   * True only when something RUNS the reconciler automatically — not merely
   * when it exists.
   *
   * As of 636a8225 reconcileProject() is written and proven live, but the only
   * caller in the tree is scripts/v2/promote-rollback-proof.ts. No worker,
   * cron or route invokes it, so an alias write moves the pointer and nothing
   * else happens until someone runs it by hand. Saying "now serving" here
   * would be the same overclaim as v1's dashboard.
   */
  routingLive: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const options = candidates.filter((c) => c.ref !== currentDeploymentRef);

  if (options.length === 0) {
    return (
      <p className="m-0 text-[12px] text-white/30">
        No other ready deployment to switch to.
      </p>
    );
  }

  async function apply() {
    if (!selected) return;
    setBusy(true);
    setResult(null);

    const res = await fetch(`/api/v2/projects/${projectRef}/aliases`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: aliasRef, deployment: selected }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setResult(body?.error?.message ?? "Could not update the alias.");
      setBusy(false);
      return;
    }

    setResult(
      routingLive
        ? // Not "now serving": rollback scales a stopped pod back up, so the
          // hostname answers a few seconds later, not immediately.
          `${hostname} points at this deployment. The pod is starting; traffic follows shortly.`
        : `${hostname} now records this deployment. Traffic follows when the reconciler runs — nothing schedules it yet, so that is currently a manual step.`
    );
    setBusy(false);
    setSelected("");
    // Re-fetch the server component so the alias table reflects the change
    // rather than this component holding a private, divergent truth.
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={busy}
        className="border border-white/[0.12] bg-black/30 px-2.5 py-1.5 text-[12.5px] text-white outline-none focus:border-[#0095FF]/60 disabled:opacity-40"
      >
        <option value="">Switch to…</option>
        {options.map((c) => (
          <option key={c.ref} value={c.ref}>
            {c.shortSha}
            {c.message ? ` — ${c.message.slice(0, 44)}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={apply}
        disabled={busy || !selected}
        className="border border-white/[0.14] px-3 py-1.5 text-[12.5px] text-white transition-colors hover:border-[#0095FF] hover:bg-[#0095FF]/10 disabled:opacity-40"
      >
        {busy ? "Applying…" : routingLive ? "Serve this" : "Point alias here"}
      </button>
      {result && (
        <span className="text-[12px] text-white/55">{result}</span>
      )}
    </div>
  );
}
