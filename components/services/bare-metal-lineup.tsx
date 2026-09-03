"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Container } from "@/components/ui/container";
import {
  BARE_METAL_SKUS,
  BARE_METAL_SERIES,
  type BareMetalSku,
  type SeriesKey,
  type CategoryKey,
  type Vendor,
} from "@/lib/catalog/bare-metal";

/**
 * The full dedicated-server lineup.
 *
 * GROUPED BY SERIES, FILTERED BY WORKLOAD — which is not a layout preference,
 * it is what lib/catalog/bare-metal.ts says these two axes are for. `series`
 * answers "which range am I shopping in", `category` answers "what is this good
 * at", and a buyer arrives already holding an opinion about the first. Sorting
 * sixteen machines into one flat price list would put a desktop-class game
 * server next to a dual-socket EPYC and make the reader do the grouping.
 *
 * EVERY NUMBER HERE COMES FROM THE CATALOG. There is exactly one source for
 * this lineup and this component is not allowed to become a second one — the
 * file it reads exists because there WERE two, and they disagreed on the same
 * silicon: the Xeon E-2388G was $99 on the marketing site and $199 in the
 * dashboard, and a visitor found out after signing up. Nothing on this page is
 * typed by hand.
 */

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

const SERIES_ORDER = (Object.keys(BARE_METAL_SERIES) as SeriesKey[]).sort(
  (a, b) => BARE_METAL_SERIES[a].order - BARE_METAL_SERIES[b].order
);

/** Workload labels. Same words the dashboard storefront uses. */
const CATEGORY_LABEL: Record<CategoryKey, string> = {
  edge: "Edge",
  general: "General purpose",
  compute: "Compute",
  memory: "Memory",
  storage: "Storage",
  hpc: "HPC / Virtualization",
};

const REGION_LABEL: Record<string, string> = {
  fra: "Frankfurt",
  ams: "Amsterdam",
  lon: "London",
  sgp: "Singapore",
  bom: "Mumbai",
  nyc: "New York",
};

const STOCK_LABEL: Record<string, { text: string; tone: string }> = {
  "in-stock": { text: "Available now", tone: "#4ade80" },
  "ready-24h": { text: "Ready in 1 day", tone: "rgba(255,255,255,0.5)" },
  "ready-48h": { text: "Ready in 2 days", tone: "rgba(255,255,255,0.5)" },
};

const FEATURE_LABEL: Record<string, string> = {
  ddos: "DDoS protection",
  ipmi: "IPMI / KVM",
  raid: "Hardware RAID",
  privatenet: "Private network",
  redundantpsu: "Redundant PSU",
  gpuready: "GPU-ready",
};

/** Workloads that actually appear in the catalog, in the catalog's order. */
const WORKLOADS: CategoryKey[] = (
  ["edge", "general", "compute", "memory", "storage", "hpc"] as CategoryKey[]
).filter((c) => BARE_METAL_SKUS.some((s) => s.category === c));

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div
        className={`${MONO} text-[9.5px] uppercase tracking-[0.16em] text-white/35`}
      >
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] text-white/85" title={value}>
        {value}
      </div>
    </div>
  );
}

function ServerRow({ sku }: { sku: BareMetalSku }) {
  const stock = STOCK_LABEL[sku.stock] ?? STOCK_LABEL["ready-48h"];
  const cores =
    sku.cpu.sockets > 1
      ? `${sku.cpu.cores} cores / ${sku.cpu.threads} threads · ${sku.cpu.sockets} sockets`
      : `${sku.cpu.cores} cores / ${sku.cpu.threads} threads`;

  return (
    <div className="border-t border-white/[0.07] px-5 py-5 transition-colors hover:bg-white/[0.02] lg:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-6">
        {/* Identity */}
        <div className="min-w-0 lg:w-[248px] lg:shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-medium text-white">
              {sku.name}
            </h3>
            <span
              className={`${MONO} shrink-0 text-[9.5px] uppercase tracking-[0.14em] text-white/40`}
            >
              {sku.vendor === "amd" ? "AMD" : "Intel"}
            </span>
          </div>
          <p className="mt-1 truncate text-[12.5px] text-white/50" title={sku.cpu.model}>
            {sku.cpu.model}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: stock.tone }}
            />
            {/*
              The availability word, not a colour alone. Roughly one man in
              twelve cannot reliably separate the green from the grey, and this
              is the field that says whether the machine can be had today.
            */}
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em]`} style={{ color: stock.tone }}>
              {stock.text}
            </span>
          </div>
        </div>

        {/* Specs */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
          <SpecCell label="CPU" value={cores} />
          <SpecCell label="Memory" value={`${sku.ramGb} GB ${sku.ramType}`} />
          <SpecCell label="Storage" value={sku.storage} />
          <SpecCell
            label="Network"
            value={`${sku.uplinkGbps} Gbps · ${sku.bandwidth}`}
          />
        </div>

        {/* Price + action */}
        <div className="flex items-center justify-between gap-4 lg:w-[190px] lg:shrink-0 lg:justify-end">
          <div className="text-right">
            {sku.priceWas !== undefined && sku.priceWas > sku.priceMonthly && (
              <div className="text-[12px] text-white/30 line-through">
                {money(sku.priceWas)}
              </div>
            )}
            <div className="font-mono text-[19px] leading-none text-white tabular-nums">
              {money(sku.priceMonthly)}
            </div>
            <div className={`${MONO} mt-1 text-[9.5px] uppercase tracking-[0.16em] text-white/35`}>
              per month
            </div>
          </div>
          {/*
            Bare metal has no provider integration — the catalog says so — so
            this opens a conversation rather than a checkout. Saying "Configure"
            over a button that cannot provision would be the v1 dashboard's
            habit of advertising capability it did not have.
          */}
          <Link
            href={`/contact?subject=${encodeURIComponent(`Dedicated server: ${sku.name}`)}`}
            className="inline-flex shrink-0 items-center gap-1.5 border border-white/[0.14] px-3.5 py-2 text-[12.5px] text-white transition-colors hover:border-[#0095FF]/60 hover:bg-[#0095FF]/10"
          >
            Request
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Included + regions */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 lg:pl-[272px]">
        {sku.features.map((f) => (
          <span
            key={f}
            className="inline-flex items-center gap-1 text-[11.5px] text-white/45"
          >
            <Check className="h-3 w-3 text-white/30" strokeWidth={2.4} />
            {FEATURE_LABEL[f] ?? f}
          </span>
        ))}
        <span className={`${MONO} ml-auto text-[10px] uppercase tracking-[0.14em] text-white/30`}>
          {sku.regions.map((r) => REGION_LABEL[r] ?? r).join(" · ")}
        </span>
      </div>
    </div>
  );
}

export function BareMetalLineup() {
  const [workload, setWorkload] = useState<CategoryKey | "all">("all");
  const [vendor, setVendor] = useState<Vendor | "all">("all");

  const visible = useMemo(
    () =>
      BARE_METAL_SKUS.filter(
        (s) =>
          (workload === "all" || s.category === workload) &&
          (vendor === "all" || s.vendor === vendor)
      ),
    [workload, vendor]
  );

  const grouped = useMemo(
    () =>
      SERIES_ORDER.map((key) => ({
        key,
        meta: BARE_METAL_SERIES[key],
        items: visible
          .filter((s) => s.series === key)
          .sort((a, b) => a.priceMonthly - b.priceMonthly),
      })).filter((g) => g.items.length > 0),
    [visible]
  );

  return (
    <section id="lineup" className="relative px-6 py-16 sm:px-10 lg:px-12 lg:py-24">
      <Container className="relative z-10">
        <div className="flex flex-col gap-6 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-[400] leading-[1.05] tracking-tight text-white sm:text-4xl">
              The full lineup
            </h2>
            <p className="mt-3 max-w-[520px] text-[15px] leading-[1.6] text-white/55">
              {BARE_METAL_SKUS.length} machines across {SERIES_ORDER.length}{" "}
              ranges, from {money(Math.min(...BARE_METAL_SKUS.map((s) => s.priceMonthly)))} to{" "}
              {money(Math.max(...BARE_METAL_SKUS.map((s) => s.priceMonthly)))} a month.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`${MONO} mr-1 text-[9.5px] uppercase tracking-[0.16em] text-white/35`}>
                Workload
              </span>
              {(["all", ...WORKLOADS] as const).map((c) => {
                const on = workload === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setWorkload(c as CategoryKey | "all")}
                    aria-pressed={on}
                    className={`border px-2.5 py-1.5 text-[12px] transition-colors ${
                      on
                        ? "border-[#0095FF]/60 bg-[#0095FF]/[0.12] text-white"
                        : "border-white/[0.1] text-white/55 hover:border-white/25 hover:text-white/80"
                    }`}
                  >
                    {c === "all" ? "All" : CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`${MONO} mr-1 text-[9.5px] uppercase tracking-[0.16em] text-white/35`}>
                Vendor
              </span>
              {(["all", "amd", "intel"] as const).map((v) => {
                const on = vendor === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVendor(v)}
                    aria-pressed={on}
                    className={`border px-2.5 py-1.5 text-[12px] transition-colors ${
                      on
                        ? "border-[#0095FF]/60 bg-[#0095FF]/[0.12] text-white"
                        : "border-white/[0.1] text-white/55 hover:border-white/25 hover:text-white/80"
                    }`}
                  >
                    {v === "all" ? "All" : v === "amd" ? "AMD" : "Intel"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live region so a filter change is announced, not just seen. */}
        <p aria-live="polite" className="sr-only">
          {visible.length} of {BARE_METAL_SKUS.length} servers shown
        </p>

        {grouped.length === 0 ? (
          <div className="border border-white/[0.1] bg-white/[0.02] px-6 py-14 text-center">
            <p className="text-[14px] text-white/70">
              No machine in the lineup matches that combination.
            </p>
            <button
              type="button"
              onClick={() => {
                setWorkload("all");
                setVendor("all");
              }}
              className="mt-3 text-[13px] text-[#0095FF] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="mt-10 space-y-12">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[19px] font-medium text-white">
                    {g.meta.label}
                  </h3>
                  <p className="text-[13px] text-white/45">{g.meta.blurb}</p>
                  <span
                    className={`${MONO} ml-auto text-[10px] uppercase tracking-[0.16em] text-white/30`}
                  >
                    {g.items.length} {g.items.length === 1 ? "machine" : "machines"}
                  </span>
                </div>
                <div className="mt-4 border border-white/[0.08] bg-white/[0.015]">
                  {g.items.map((sku) => (
                    <ServerRow key={sku.id} sku={sku} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 border-t border-white/[0.08] pt-6 text-[12.5px] leading-[1.7] text-white/40">
          Prices are monthly and exclude tax. Availability is per region and
          changes with stock. Need a configuration that is not listed —
          different disks, more memory, a GPU —{" "}
          <Link href="/contact" className="text-white/70 underline underline-offset-4 hover:text-white">
            tell us what you need
          </Link>
          .
        </p>
      </Container>
    </section>
  );
}

export default BareMetalLineup;
