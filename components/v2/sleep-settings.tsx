"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Notice } from "@/components/v2/notice";

/**
 * Scale-to-zero settings.
 *
 * Framed as a TRADE, not a saving. The app costs nothing while asleep and the
 * first visitor after an idle period waits several seconds. Some apps should
 * never have this on — anything behind a health check, anything a human is
 * watching. Off by default for that reason, and the copy says what it costs
 * before it says what it saves.
 *
 * ONE CLAIM THIS MUST NOT MAKE: that apps sleep automatically after N minutes.
 * The idle sweep is a script, not a schedule, so today an app sleeps only when
 * someone runs it. That would be true of the design and false of the system —
 * exactly the gap between a plan and a platform that v1's dashboard papered
 * over with auto-scaling and 99.99% uptime it never had.
 */

const PLATFORM_DEFAULT_SECONDS = 900;
const MIN_IDLE_SECONDS = 60;

export function SleepSettings({
  projectRef,
  enabled,
  idleSeconds,
  sweepScheduled,
}: {
  projectRef: string;
  enabled: boolean;
  idleSeconds: number | null;
  /** False while the idle sweep is a script nobody runs on a timer. */
  sweepScheduled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [idle, setIdle] = useState(String(idleSeconds ?? PLATFORM_DEFAULT_SECONDS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { scaleToZero?: boolean; idleSeconds?: number | null }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectRef}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not save that.");
      setOn(enabled); // reflect what the server still holds
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  const seconds = Number(idle);
  const badIdle =
    !Number.isInteger(seconds) || seconds < MIN_IDLE_SECONDS;

  return (
    <div>
      <label className="flex cursor-pointer select-none items-start gap-3">
        <span
          className={`relative mt-[2px] h-[18px] w-[32px] shrink-0 border transition-colors ${
 on ? "border-[#0095FF]/60 bg-[#0095FF]/25" : "border-white/15 bg-white/[0.04]"
 }`}
        >
          <span
            className={`absolute top-[2px] h-[12px] w-[12px] transition-all duration-200 ${
 on ? "left-[16px] bg-[#0095FF]" : "left-[2px] bg-white/40"
 }`}
          />
        </span>
        <input
          type="checkbox"
          className="sr-only"
          checked={on}
          disabled={busy}
          onChange={(e) => {
            setOn(e.target.checked);
            save({ scaleToZero: e.target.checked });
          }}
        />
        <span>
          <span className="text-[13.5px] text-white">Sleep when idle</span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.6] text-white/45">
            The app is scaled to zero after a period with no requests and costs
            nothing while asleep. The first visitor after that waits several
            seconds for it to wake.
          </span>
        </span>
      </label>

      {on && (
        <div className="mt-4 flex flex-wrap items-center gap-2 pl-[44px]">
          <span className="text-[12.5px] text-white/55">Idle for</span>
          <input
            value={idle}
            onChange={(e) => setIdle(e.target.value)}
            onBlur={() => {
              if (!badIdle && seconds !== (idleSeconds ?? PLATFORM_DEFAULT_SECONDS)) {
                save({ idleSeconds: seconds });
              }
            }}
            inputMode="numeric"
            className="w-[90px] border border-white/[0.12] bg-black/30 px-2.5 py-1.5 text-right font-mono text-[13px] text-white outline-none focus:border-[#0095FF]/60"
          />
          <span className="text-[12.5px] text-white/55">seconds before sleeping</span>
          {idleSeconds === null && (
            <span className="text-[12px] text-white/30">
              (platform default)
            </span>
          )}
          {badIdle && (
            <span className="text-[12px] text-rose-300">
              At least {MIN_IDLE_SECONDS} seconds — below that the app sleeps
              between a visitor&rsquo;s own page loads.
            </span>
          )}
        </div>
      )}

      {on && !sweepScheduled && (
        <Notice
          tone="blocked"
          title="Nothing puts apps to sleep automatically yet."
          action="Sleeping is checked periodically, not the instant an app goes quiet."
          className="mt-4"
        >
          This setting is recorded and will be honoured once the sweep is
          scheduled. Until then the app stays awake regardless of the value
          above.
        </Notice>
      )}

      {error && (
        <p className="m-0 mt-3 text-[12.5px] text-rose-300">{error}</p>
      )}
    </div>
  );
}
