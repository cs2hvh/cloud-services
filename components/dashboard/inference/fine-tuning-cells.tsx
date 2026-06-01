"use client";

/**
 * Leaf presentational components extracted from fine-tuning.tsx. Each
 * is purely render-based with no cross-component state — extracting
 * them keeps the main file (which still owns the list + expand-row +
 * create-dialog flows) focused on flow logic instead of cell chrome.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { ACCENT_BRIGHT, MONO } from "@/components/dashboard/inference/chrome";

// ─── Hosted-serving lifecycle pills + stats ─────────────────────────

export function PodStatePill({ state }: { state: string }) {
  const map: Record<string, { color: string; label: string; pulse?: boolean }> = {
    none:         { color: "rgba(255,255,255,0.35)", label: "Inactive" },
    provisioning: { color: "#33adff", label: "Starting", pulse: true },
    running:      { color: "#22c55e", label: "Running" },
    stopped:      { color: "rgba(255,255,255,0.35)", label: "Stopped" },
    failed:       { color: "#ef4444", label: "Failed" },
  };
  const m = map[state] ?? map.none!;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${m.pulse ? "animate-pulse" : ""}`}
        style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }}
      />
      <span
        className={`${MONO} uppercase tracking-[0.12em] font-semibold`}
        style={{ color: m.color }}
      >
        {m.label}
      </span>
    </span>
  );
}

export function PodStat({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[4px] border border-white/[0.06] bg-[#0c0d11] px-3 py-2">
      <p className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/40 mb-1`}>
        {label}
      </p>
      <p className={`${mono ? MONO : ""} text-[11.5px] text-white/85 break-all`}>{children}</p>
    </div>
  );
}

/**
 * Tick-every-second banner that swaps stage copy as the serving instance
 * warms up. Typical cold-start is 45-90s; we show friendlier text after
 * that to set the expectation that larger bases take longer.
 */
export function ProvisioningBanner({
  startedAt,
}: {
  startedAt: string | null | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const elapsedSec = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : 0;
  const stage =
    elapsedSec < 30
      ? "Booting GPU and pulling the serving image…"
      : elapsedSec < 75
        ? "Downloading your adapter and warming up the serving runtime…"
        : elapsedSec < 150
          ? "Larger base — still loading model weights into GPU memory…"
          : "Taking longer than expected. If this exceeds 5 minutes, stop the instance and try a different GPU.";
  return (
    <div className="mb-3 rounded-[5px] border border-[#33adff]/25 bg-[#0095FF]/[0.06] p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Loader2 className="h-3 w-3 animate-spin" style={{ color: ACCENT_BRIGHT }} />
        <span
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] font-semibold`}
          style={{ color: ACCENT_BRIGHT }}
        >
          Starting — {String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:
          {String(elapsedSec % 60).padStart(2, "0")} elapsed
        </span>
      </div>
      <p className={`${MONO} text-[10.5px] text-white/55 leading-relaxed`}>
        {stage} Requests during warm-up return a 503 with{" "}
        <code className="text-white/75">Retry-After: 10</code> — your SDK should retry automatically.
      </p>
    </div>
  );
}

/**
 * Live runtime + cost-so-far display for a running serving instance.
 * Only renders when `live` is true; ticks every second. When the
 * instance stops, pass live={false} and the timer detaches.
 */
export function RunningCostMeter({
  startedAt,
  hourlyCents,
  live,
}: {
  startedAt: string | null | undefined;
  hourlyCents: number | null | undefined;
  live: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  if (!startedAt || hourlyCents == null) return null;
  const elapsedSec = Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
  const costCents = (elapsedSec / 3600) * hourlyCents;
  const hh = Math.floor(elapsedSec / 3600);
  const mm = Math.floor((elapsedSec % 3600) / 60);
  const ss = Math.floor(elapsedSec % 60);
  const runtime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      <PodStat label="Runtime">{runtime}</PodStat>
      <PodStat label="Cost so far">${(costCents / 100).toFixed(4)}</PodStat>
    </div>
  );
}

// ─── Form / reference chrome (used in the create-FT dialog) ─────────

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ReferenceCard({
  icon: Icon,
  eyebrow,
  title,
  body,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-[#0095FF]/70" />
        <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
          {eyebrow}
        </p>
      </div>
      <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">{title}</h4>
      <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>{body}</p>
    </div>
  );
}
