"use client";

/**
 * GpuLineup — the /services/gpu catalog section.
 *
 * Laid out like the home page's PlatformExplorer: a chip row picks an
 * architecture, the left column explains it, the right column tables that
 * family's GPUs. Only one family is on screen at a time, so the whole catalog
 * is reachable in roughly the height of the largest family (nine rows) rather
 * than the twenty-one-row wall a flat table produced.
 *
 * Every figure is a live reading or a verified vendor spec. Cells we cannot
 * source render as a dash rather than a guess — see GPU_EDITORIAL.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ARCH_FAMILIES } from "@/lib/catalog/gpu-editorial";
import type { GpuEditorial } from "@/lib/catalog/gpu-editorial";
import type { PublicStock } from "@/lib/catalog/gpu";

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

/** Matches the plan table on /services/compute so the two pages read as one system. */
const HEADER_STRIP =
  "bg-[linear-gradient(90deg,rgba(0,149,255,0.10),rgba(255,255,255,0.04)_22%,rgba(255,255,255,0.03)_100%)]";

export type LineupGpu = {
  id: string;
  name: string;
  memoryGB: number;
  pricePerHour: number | null;
  stock: PublicStock;
  availableCounts: number[];
  href: string;
} & GpuEditorial;

const STOCK_META: Record<PublicStock, { color: string; label: string }> = {
  available: { color: "#35d07f", label: "In stock" },
  limited: { color: "#f5b324", label: "Limited" },
  unavailable: { color: "rgba(255,255,255,0.3)", label: "Out of stock" },
  // Shown when the reading is older than the freshness window. Claiming "In
  // stock" from a stale snapshot sends people into a deploy that fails.
  unknown: { color: "#7fc7ff", label: "Check" },
};

const DASH = "–";

function formatHourly(hourly: number) {
  return `$${hourly.toFixed(2)}`;
}

/** We bill by the second; showing it costs a line and needs no control. */
function formatPerSecond(hourly: number) {
  const perSec = hourly / 3600;
  return `$${perSec.toFixed(perSec >= 0.001 ? 5 : 6)}`;
}

export function GpuLineup({
  gpus,
  observedAt,
  stockIsFresh,
}: {
  gpus: LineupGpu[];
  observedAt: string | null;
  /** False when every reading is older than STOCK_FRESHNESS_MS. */
  stockIsFresh: boolean;
}) {
  // Only families we actually have stock rows for get a tab.
  const families = useMemo(
    () => ARCH_FAMILIES.filter((f) => gpus.some((g) => g.archTier === f.key)),
    [gpus]
  );

  const [familyKey, setFamilyKey] = useState<string>(
    () => ARCH_FAMILIES.find((f) => gpus.some((g) => g.archTier === f.key))?.key ?? "blackwell"
  );

  const family = families.find((f) => f.key === familyKey) ?? families[0];
  const rows = useMemo(
    () => gpus.filter((g) => g.archTier === family?.key),
    [gpus, family]
  );

  // Everything in the left column is derived, so it can never drift from the table.
  const stats = useMemo(() => {
    const prices = rows.map((r) => r.pricePerHour).filter((p): p is number => p !== null);
    const memories = rows.map((r) => r.memoryGB);
    const pods = rows.flatMap((r) => r.availableCounts);
    return {
      models: rows.length,
      minMem: memories.length ? Math.min(...memories) : 0,
      maxMem: memories.length ? Math.max(...memories) : 0,
      from: prices.length ? Math.min(...prices) : null,
      maxPod: pods.length ? Math.max(...pods) : 0,
    };
  }, [rows]);

  if (!family) return null;

  return (
    <div>
      {/* ── family switcher — sits directly under the heading ── */}
      <div className="mt-10 flex flex-wrap gap-2.5">
        {families.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFamilyKey(f.key)}
            aria-pressed={f.key === familyKey}
            className={`ah-chip ah-notch-sm px-4 py-2.5 text-[13px] font-medium ${
              f.key === familyKey ? "ah-chip-on" : ""
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!stockIsFresh && (
        <div className="mt-8 flex items-start gap-3 border border-white/[0.09] bg-[#f5b324]/[0.06] px-4 py-3 sm:px-5">
          <span
            aria-hidden="true"
            className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full bg-[#f5b324]"
          />
          <p className="m-0 text-[12.5px] leading-[1.6] text-white/65">
            <span className="text-white">Availability is unconfirmed.</span> The inventory
            sync last reported{" "}
            {observedAt ? relativeTime(observedAt) : "some time ago"}, so every GPU reads
            &ldquo;Check&rdquo; rather than claiming stock we cannot see. Prices are the
            live resale rates and are unaffected.
          </p>
        </div>
      )}

      {/* ── explorer ── */}
      {/*
        Keyed on the family so React remounts it and the panel entry animation
        replays on every switch — otherwise the content swaps instantly and the
        section feels inert.
      */}
      <div
        key={family.key}
        className={`${stockIsFresh ? "mt-12" : "mt-3"} grid lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]`}
        style={{ borderTop: "1px solid var(--ah-line-hi)" }}
      >
        {/* ── left: what this family is for ── */}
        <div
          // The divider is the gap between two columns, so it only exists
          // once there are two columns. Inline-styling it would draw a rule
          // down the right edge of the screen on mobile.
          className="ah-panel min-w-0 px-0 py-8 lg:border-r lg:border-[var(--ah-line)] lg:py-10 lg:pr-12"
        >
          <div className="ah-lbl mb-6 flex items-center gap-2" style={{ color: "var(--ah-blue-lt)" }}>
            <span
              aria-hidden="true"
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: family.tone }}
            />
            Architecture
          </div>

          <h3 className="m-0 text-[clamp(1.7rem,2.8vw,2.25rem)] font-light leading-tight tracking-[-0.025em] text-white">
            {family.label}
          </h3>

          <p className="mt-5 max-w-[34rem] text-[15px] leading-[1.65] text-white/55">
            {family.blurb}
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-px bg-white/[0.07]">
            <Stat label="Models" value={String(stats.models)} />
            <Stat
              label="Memory"
              value={
                stats.minMem === stats.maxMem
                  ? `${stats.maxMem} GB`
                  : `${stats.minMem}–${stats.maxMem} GB`
              }
            />
            <Stat
              label="From"
              value={stats.from === null ? DASH : `${formatHourly(stats.from)}/hr`}
            />
            <Stat
              label="Pod size"
              value={stats.maxPod > 0 ? `up to ${stats.maxPod}×` : DASH}
            />
          </dl>

          <Link
            href="/dashboard/services/gpu/deploy"
            className="ah-tag mt-8 inline-flex items-center gap-2 border border-white/[0.16] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:border-[#0095FF] hover:bg-[#0095FF]/10"
          >
            Deploy on {family.label}
            <Arrow />
          </Link>
        </div>

        {/* ── right: the family's GPUs, priced ── */}
        <div className="min-w-0 pt-8 lg:pl-12 lg:pt-10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-left">
              <thead>
                <tr className={HEADER_STRIP}>
                  <Th className="pl-4">GPU</Th>
                  <Th>Memory</Th>
                  <Th>Bandwidth</Th>
                  <Th>Pod</Th>
                  <Th className="pr-4 text-right">$ / GPU&middot;hr</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((gpu, index) => {
                  const stock = STOCK_META[gpu.stock];
                  const maxCount = gpu.availableCounts.length
                    ? Math.max(...gpu.availableCounts)
                    : 0;
                  return (
                    <tr
                      key={gpu.id}
                      className={`group transition-colors duration-150 hover:bg-white/[0.06] ${
                        index % 2 === 1 ? "bg-white/[0.025]" : "bg-transparent"
                      } ${index < rows.length - 1 ? "border-b border-white/[0.06]" : ""}`}
                    >
                      <td className="relative py-3.5 pl-4 pr-3">
                        {gpu.featured && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-[2px]"
                            style={{ background: family.tone }}
                          />
                        )}
                        <Link
                          href={gpu.href}
                          className="flex items-center gap-2 text-[14px] font-medium text-white transition-colors hover:text-[#7fc7ff]"
                        >
                          {gpu.name}
                          <Arrow className="opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                        <span
                          className="mt-1 inline-flex items-center gap-1.5 text-[11.5px]"
                          style={{ color: stock.color }}
                        >
                          <span
                            className="h-[4px] w-[4px] rounded-full"
                            style={{ background: stock.color }}
                          />
                          {stock.label}
                        </span>
                      </td>
                      <Td>
                        <span className={`${MONO} tabular-nums text-white/90`}>
                          {gpu.memoryGB} GB
                        </span>
                        <span className="ml-1.5 text-[11px] text-white/35">
                          {gpu.memoryType}
                        </span>
                      </Td>
                      <Td className={`${MONO} tabular-nums text-white/65`}>
                        {gpu.bandwidth ?? DASH}
                      </Td>
                      <Td className={`${MONO} tabular-nums text-white/65`}>
                        {podLabel(maxCount)}
                      </Td>
                      <td className="py-3.5 pl-3 pr-4 text-right">
                        {gpu.pricePerHour === null ? (
                          <span className="text-white/30">{DASH}</span>
                        ) : (
                          <>
                            <span className={`${MONO} block text-[14.5px] tabular-nums text-white`}>
                              {formatHourly(gpu.pricePerHour)}
                            </span>
                            <span className={`${MONO} block text-[11px] tabular-nums text-white/35`}>
                              {formatPerSecond(gpu.pricePerHour)}/sec
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── footer ── */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="m-0 max-w-[46rem] text-[12.5px] leading-[1.6] text-white/40">
          {observedAt
            ? `Price and availability read from the provider ${relativeTime(observedAt)}.`
            : "Price and availability are read live from the provider."}{" "}
          Blank cells are figures we have not verified against a vendor sheet.
        </p>
        <Link
          href="/dashboard/services/gpu/enterprise"
          className="group inline-flex w-fit items-center gap-2 whitespace-nowrap text-[12.5px] font-medium text-white transition-colors hover:text-[#0095FF]"
        >
          Need reserved capacity? Talk to sales
          <Arrow className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Bits ──────────────────────────────────────────────────────

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0D0D0F] px-4 py-3.5">
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-white/30">{label}</dt>
      <dd className={`${MONO} m-0 mt-1.5 text-[15px] tabular-nums text-white`}>{value}</dd>
    </div>
  );
}

function Th({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={`border-b border-white/[0.08] px-2.5 py-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <td className={`px-2.5 py-3.5 text-[13px] ${className}`}>{children}</td>;
}

/** A single orderable size is not a range. */
function podLabel(maxCount: number) {
  if (maxCount <= 0) return DASH;
  return maxCount === 1 ? "1×" : `1–${maxCount}×`;
}

/** Coarse "x ago" for the freshness line. Hours are precise enough here. */
function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "in the last hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default GpuLineup;
