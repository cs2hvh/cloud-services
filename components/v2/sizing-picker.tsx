"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice } from "@/components/v2/notice";
import { ColHead, V2_MONO } from "@/components/v2/kit";

/**
 * Instance size and count.
 *
 * Flat rate: price = tier price x instance count, and nothing is metered. That
 * makes this the whole of the customer's bill, which is why the number below
 * is stated plainly rather than as an "estimate" — an estimate implies a
 * measurement that might come in higher, and there is no measurement.
 *
 * THIS COMPONENT NEVER RECEIVES A `Tier`. It takes TierOption, which has no
 * cost field. lib/paas/tiers.ts holds priceUsd AND costUsd on one object
 * because the deploy path and drift checks need both; hand that object to a
 * client component and Next serialises our margin into the page where anyone
 * can read it. The GPU deploy wizard shipped exactly that bug — the raw
 * RunPod wholesale rate rendered under a "/GPU·hr" label.
 *
 * THREE THINGS THE COPY MUST NOT SAY:
 *
 *   1. AUTOSCALING. There is none. Instance count is a number the customer
 *      sets and nothing changes it. v1's dashboard advertised auto-scaling, a
 *      global CDN and 99.99% uptime, none of which existed, and that is the
 *      single most expensive habit this rebuild is trying to break.
 *   2. "FASTER" for dedicated. Dedicated vCPU is GUARANTEED, not faster. A
 *      shared instance under no contention runs at the same speed; what the
 *      customer buys is the absence of a neighbour, not more cycles.
 *   3. Transfer multiplied by instance count. The bundle is per APP. Scaling
 *      to 3 replicas for availability does not triple the traffic an app
 *      serves, and showing 3x the allowance would invite exactly that
 *      misreading.
 */

/** A tier as the customer may see it. No cost, no margin — see SizingDto. */
export interface TierOption {
  id: string;
  label: string;
  cls: string;
  memoryMib: number;
  vcpu: number;
  transferGb: number;
  priceUsd: number;
  priceInr: number;
}

function gib(mib: number): string {
  return mib >= 1024 ? `${mib / 1024} GB` : `${mib} MB`;
}

export function SizingPicker({
  projectRef,
  tiers,
  currentTier,
  currentInstances,
  minInstances,
  maxInstances,
  deployRequired,
}: {
  projectRef: string;
  tiers: readonly TierOption[];
  currentTier: string;
  currentInstances: number;
  minInstances: number;
  maxInstances: number;
  /**
   * True while a sizing change only takes effect on the next deployment.
   * Passed in rather than assumed, because whether the reconciler picks this
   * up live is the infrastructure lane's fact, not this component's guess.
   */
  deployRequired: boolean;
}) {
  const router = useRouter();
  const [tier, setTier] = useState(currentTier);
  const [instances, setInstances] = useState(currentInstances);
  const [busy, setBusy] = useState(false);
  const [needsDeploy, setNeedsDeploy] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = tiers.find((t) => t.id === tier) ?? null;
  const dirty = tier !== currentTier || instances !== currentInstances;

  // Linear, deliberately. The Nth instance costs what the first did, because
  // the Nth pod consumes what the first did.
  const totalUsd = selected ? selected.priceUsd * instances : 0;
  const totalInr = selected ? selected.priceInr * instances : 0;
  // 730 is BILLING_HOURS_PER_MONTH in lib/paas/tiers, which is what
  // hourlyRateUsd divides by and therefore what metering charges. Written out
  // rather than imported because this file must not pull the tier module into
  // the client bundle — that module carries costUsd, which is our margin.
  const hourly = totalUsd / 730;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectRef}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, instanceCount: instances }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not save that.");
      // Reflect what the server still holds rather than the failed intent.
      setTier(currentTier);
      setInstances(currentInstances);
      setBusy(false);
      return;
    }
    setBusy(false);
    // Only after a save that landed, so the offer appears exactly when the
    // sentence asking for it does.
    if (deployRequired) setNeedsDeploy(true);
    router.refresh();
  }

  async function redeploy() {
    setDeploying(true);
    const res = await fetch(`/api/v2/projects/${projectRef}/deployments`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error?.message ?? `Could not deploy (${res.status}).`);
      setDeploying(false);
      return;
    }
    setNeedsDeploy(false);
    setDeploying(false);
    router.refresh();
  }

  const shared = tiers.filter((t) => t.cls === "shared");
  const dedicated = tiers.filter((t) => t.cls === "dedicated");

  // Which table is showing. Starts on whatever the project is actually on, so
  // opening settings does not hide the current plan behind a tab.
  const currentCls: "shared" | "dedicated" =
    tiers.find((t) => t.id === currentTier)?.cls === "dedicated" ? "dedicated" : "shared";
  const [cls, setCls] = useState<"shared" | "dedicated">(currentCls);
  const rows = cls === "shared" ? shared : dedicated;

  const GRID =
    "grid grid-cols-[18px_minmax(0,1.4fr)_minmax(52px,0.6fr)_minmax(56px,0.6fr)_minmax(88px,0.8fr)_minmax(76px,0.7fr)] gap-3";

  const CLASS_NOTE: Record<string, string> = {
    shared: "Burstable, oversubscribed. What most apps need.",
    // "Guaranteed", never "faster". See the header.
    dedicated: "Guaranteed vCPU, not shared with another tenant.",
  };

  return (
    <div>
      {/*
        ONE TABLE BEHIND A TOGGLE, which is how the VM plan picker does it. Two
        stacked tables repeated the column header, made the panel twice as tall
        as it needed to be, and implied the two classes were meant to be
        compared row against row when they are a choice between kinds.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-0.5 rounded-[5px] border border-white/[0.06] bg-[#0d0e11] p-0.5">
          {(["shared", "dedicated"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCls(c)}
              className={`${V2_MONO} h-7 rounded-[4px] px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] transition-colors`}
              style={
                cls === c
                  ? {
                      color: "#0095FF",
                      background: "rgba(0,149,255,0.10)",
                      border: "1px solid rgba(0,149,255,0.25)",
                    }
                  : { color: "rgba(255,255,255,0.55)", border: "1px solid transparent" }
              }
            >
              {c === "shared" ? "Shared CPU" : "Dedicated CPU"}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-white/35">{CLASS_NOTE[cls]}</span>
      </div>

      <div className="overflow-hidden rounded-[6px] border border-white/[0.07] bg-[#111216]">
        <div className={`${GRID} border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5`}>
          <span />
          <ColHead>Plan</ColHead>
          <ColHead align="right">Memory</ColHead>
          <ColHead align="right">vCPU</ColHead>
          <ColHead align="right">Transfer</ColHead>
          <ColHead align="right">Monthly</ColHead>
        </div>

        {rows.map((t) => {
          const on = t.id === tier;
          return (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => setTier(t.id)}
              aria-pressed={on}
              className={`w-full border-b border-white/[0.04] text-left transition-colors last:border-b-0 disabled:opacity-50 ${
                on ? "bg-[#0095FF]/[0.08]" : "hover:bg-white/[0.03]"
              }`}
            >
              <div className={`${GRID} items-center px-4 py-3`}>
                {/* A radio, because this is a choice of one — a highlight alone
                    leaves the other rows looking dim rather than selectable. */}
                <span
                  aria-hidden
                  className="relative h-[15px] w-[15px] shrink-0 rounded-full"
                  style={{
                    border: `1.5px solid ${on ? "#0095FF" : "rgba(255,255,255,0.18)"}`,
                  }}
                >
                  {on ? (
                    <span
                      className="absolute inset-[3px] block rounded-full"
                      style={{ background: "#0095FF", boxShadow: "0 0 6px rgba(0,149,255,0.6)" }}
                    />
                  ) : null}
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] text-white">{t.label}</span>
                  {t.id === currentTier ? (
                    <span className="shrink-0 rounded-[3px] border border-white/[0.15] px-1 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
                      current
                    </span>
                  ) : null}
                </span>

                <span className="text-right font-mono text-[11.5px] text-white/60">{gib(t.memoryMib)}</span>
                <span className="text-right font-mono text-[11.5px] text-white/60">{t.vcpu}</span>
                <span className="text-right font-mono text-[11.5px] text-white/45">{t.transferGb} GB</span>
                <span className="text-right font-mono text-[12.5px] text-white">${t.priceUsd}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-5">
        <span className="text-[12.5px] text-white/55">Instances</span>
        <div className="flex items-center border border-white/[0.12] bg-black/30">
          <button
            type="button"
            disabled={busy || instances <= minInstances}
            onClick={() => setInstances((n) => Math.max(minInstances, n - 1))}
            aria-label="One fewer instance"
            className="px-3 py-1.5 text-[15px] text-white/60 hover:text-white disabled:opacity-30"
          >
            −
          </button>
          <span className="min-w-[2.5rem] px-1 text-center font-mono text-[13px] text-white">
            {instances}
          </span>
          <button
            type="button"
            disabled={busy || instances >= maxInstances}
            onClick={() => setInstances((n) => Math.min(maxInstances, n + 1))}
            aria-label="One more instance"
            className="px-3 py-1.5 text-[15px] text-white/60 hover:text-white disabled:opacity-30"
          >
            +
          </button>
        </div>
        <span className="text-[12px] text-white/30">
          Max {maxInstances}. Copies of the app behind one address — they do not
          add or remove themselves.
        </span>
      </div>

      {selected && (
        /*
          The VM page's cost block: a hairline-topped panel on a darker ground,
          the label and the hourly rate on one line, then the figure at a size
          you can read from across the desk. The old version set the total at
          22px in the same weight as the row above it, so the number somebody
          came to this panel for did not look like the answer.
        */
        <div className="mt-5 overflow-hidden rounded-[6px] border border-white/[0.07]">
          <div className="border-b border-white/[0.06] bg-[#08090b] px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span
                className={`${V2_MONO} text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40`}
              >
                Monthly cost
              </span>
              {/* The hourly rate, because that is what metering actually
                  charges — an hour at a time, keyed on the hour. Derived with
                  the same 730 the server uses rather than a second constant. */}
              <span className={`${V2_MONO} text-[10.5px] text-white/45`}>
                ${hourly.toFixed(4)} / hr
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-[18px] font-medium leading-none text-white/50">$</span>
              <span className="text-[38px] font-bold leading-none tracking-[-0.03em] tabular-nums text-white">
                {totalUsd}
              </span>
              <span className={`${V2_MONO} ml-1 text-[11px] text-white/40`}>/mo</span>
              <span className={`${V2_MONO} ml-3 text-[12px] text-white/35`}>
                ₹{totalInr.toLocaleString("en-IN")}
              </span>
            </div>

            <p className={`${V2_MONO} mt-2 text-[11px] text-white/35`}>
              {selected.label} × {instances}
              {instances > 1 && ` · $${selected.priceUsd} each`}
            </p>
          </div>

          {/* Transfer is per APP and never multiplied by instance count, which
              is the one thing about this price people get wrong. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
            <span className={`${V2_MONO} text-[11px] text-white/45`}>
              {selected.transferGb} GB transfer included
            </span>
            <span className={`${V2_MONO} text-[11px] text-white/25`}>
              per app, not per instance · then $0.01/GB
            </span>
          </div>
        </div>
      )}

      {dirty && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="border border-[#0095FF]/50 bg-[#0095FF]/15 px-4 py-2 text-[13px] text-white transition-colors hover:bg-[#0095FF]/25 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save sizing"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setTier(currentTier);
              setInstances(currentInstances);
              setError(null);
            }}
            className="text-[13px] text-white/45 hover:text-white/70 disabled:opacity-50"
          >
            Cancel
          </button>
          {deployRequired && (
            <span className="text-[12px] text-white/35">
              Takes effect on the next deployment.
            </span>
          )}
        </div>
      )}

      {/* Saved, and the thing that applies it is right here. The bar above says
          a deploy is needed and used to leave you to find the button — the same
          gap the environment editor had. */}
      {needsDeploy && !dirty && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4">
          <span className="text-[12.5px] text-white/55">
            Saved. The new size applies on the next deployment.
          </span>
          <button
            type="button"
            onClick={redeploy}
            disabled={deploying}
            className="rounded-[6px] border border-white/[0.18] px-2.5 py-1 text-[12px] text-white transition-colors hover:border-white/40 disabled:opacity-40"
          >
            {deploying ? "Queueing…" : "Redeploy now"}
          </button>
        </div>
      )}

      {error && <p className="m-0 mt-3 text-[12.5px] text-rose-300">{error}</p>}

      {!selected && (
        <Notice
          tone="blocked"
          title="This project is on a size we no longer recognise."
          action="Pick one above to move it onto a current tier."
          className="mt-4"
        >
          Its stored tier is not in the current list, so no price can be shown
          for it.
        </Notice>
      )}
    </div>
  );
}
