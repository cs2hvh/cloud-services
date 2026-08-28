"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Promote / rollback.
 *
 * Both directions are one update of aliases.deployment_id — no rebuild, no
 * retag, no new image. That is why the control offers any ready deployment
 * rather than only the previous one: "roll back" and "promote" are the same
 * operation, and the UI should not pretend otherwise by hiding forward moves
 * behind a different button. Superseded deployments are scaled to zero, not
 * deleted, so every ready deployment really is a candidate.
 *
 * It is NOT instant, despite being one write. Rolling back scales a stopped
 * pod from 0 to 1, which takes seconds — the reconciler's own docs say so.
 * Nothing here may use that word.
 *
 * "Rollback available", never "guaranteed". The candidate list comes from
 * replicaStates().rollable, which means the build succeeded and recorded an
 * image — NOT that the image still exists in the registry. Verifying that
 * would be a registry round trip per deployment per page load. The weaker
 * claim is the true one.
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
  hostname,
  currentDeploymentRef,
  candidates,
  routingLive,
}: {
  projectRef: string;
  hostname: string;
  currentDeploymentRef: string | null;
  candidates: PromotableDeployment[];
  /**
   * True only when something RUNS the reconciler — not merely when it exists.
   *
   * It was false from 636a8225 until acd101ab, during which reconcileProject()
   * was written and proven but its only caller was a proof script, so a UI
   * promote moved the pointer and nothing reached the cluster. acd101ab added
   * both triggers: PATCH /aliases converges inline, and a level-triggered loop
   * repairs anything the inline call misses. Now true.
   */
  routingLive: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const options = candidates.filter((c) => c.ref !== currentDeploymentRef);

  // Nothing rather than a sentence saying there is nothing. A control that
  // announces its own absence is a line of text where a person expected a
  // button, and the caller already hides the surrounding rule in this case.
  if (options.length === 0) return null;

  async function apply() {
    if (!selected) return;
    setBusy(true);
    setResult(null);

    // /rollback, NOT PATCH /aliases. That endpoint moves ONE alias, which is
    // right for pinning a single custom domain and wrong here: a project’s
    // production and custom aliases are the same live site, so moving only
    // production leaves every custom domain serving the version just judged
    // broken. This page did exactly that — rolling back v2-docker left
    // app.ahurasense.ai behind, and nothing reported a problem because each
    // alias was individually consistent.
    //
    // It also refuses what PATCH could not see: a deployment whose image the
    // registry no longer has, which would replace a working site with a pod
    // that cannot start.
    const res = await fetch(`/api/v2/projects/${projectRef}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployment: selected }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setResult(body?.error?.message ?? "Could not roll back.");
      setBusy(false);
      return;
    }

    // Surfaced rather than swallowed. The rollback IS durable — the alias
    // write succeeded — but the cluster has not caught up, and an operator
    // who is not told will repeat a write that already worked.
    if (body?.converged === false) {
      setResult(
        `Rolled back, but the cluster has not converged yet. It is recorded and ` +
          `will be applied — do not repeat it. (${body?.convergeError ?? "no detail"})`,
      );
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
        <option value="">Rollback available…</option>
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
