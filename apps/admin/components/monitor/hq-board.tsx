"use client";

// The HQ board — the whole platform as a living map. People flow into apps,
// apps into services, services into the billing pipeline; providers feed the
// services from above. Node tones and edge animation are driven by the live
// /api/admin/monitor feed (12s poll), so "is money moving" and "is anything
// red" are answerable at a glance from across a room.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import type { HqEvent } from "@admin/app/api/admin/monitor/route";

type Tone = "ok" | "warn" | "bad" | "dim" | "info";

interface Feed {
  ok: boolean;
  at: string;
  users: { total: number | null; new24h: number | null };
  services: Record<string, number | null>;
  billing: {
    sweepLastAt: string | null;
    sweepAgeH: number | null;
    charged24h: number;
    chargeCount24h: number;
    charges24hTruncated: boolean;
    byService: Record<string, { count: number; usd: number }>;
    openMeters: number | null;
    invariantBad: number | null;
    coverage: {
      open: number;
      expected: number;
      billed: number;
      missing: number;
      worst: { service_type: string; missing: number } | null;
      overBilled: number;
    } | null;
    unpricedSellable: number | null;
    gpuBooks: {
      agrees: boolean;
      chargeMarkup: number;
      quoteMin: number;
      quoteMax: number;
    } | null;
    failuresUnresolved: number | null;
    livePrices: number | null;
    liveCoupons: number | null;
    topups24h: number;
    couponRedemptions24h: number;
  };
  providers: {
    linodeSyncAt: string | null;
    linodeSyncAgeH: number | null;
    mainApp: { up: boolean; ms: number | null };
  };
  audits: { up: boolean; rows: number | null; error: string | null };
  events: HqEvent[];
}

const TONE_RING: Record<Tone, string> = {
  ok: "border-emerald-500/45",
  warn: "border-amber-500/55",
  bad: "border-red-500/60",
  dim: "border-white/[0.09]",
  info: "border-[#3987e5]/55",
};
const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  dim: "bg-white/25",
  info: "bg-[#3987e5]",
};

interface HqNodeData {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  href?: string;
  wide?: boolean;
  [key: string]: unknown;
}

function HqNode({ data }: NodeProps<Node<HqNodeData>>) {
  const body = (
    <div
      className={`rounded-lg border bg-[#111216]/95 px-3 py-2 shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur transition-colors ${
        TONE_RING[data.tone]
      } ${data.href ? "hover:border-[#3987e5]/70" : ""} ${data.wide ? "w-[230px]" : "w-[172px]"}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[data.tone]}`} />
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {data.label}
        </span>
      </div>
      <div className="mt-1 font-heading text-[17px] font-semibold leading-tight tracking-tight text-white">
        {data.value}
      </div>
      {data.sub && (
        <div className="mt-0.5 truncate text-[10.5px] leading-tight text-white/40">{data.sub}</div>
      )}
      {/* Invisible handles on all four sides so edges can approach naturally. */}
      {(["t", "b", "l", "r"] as const).map((id) => {
        const pos =
          id === "t" ? Position.Top : id === "b" ? Position.Bottom : id === "l" ? Position.Left : Position.Right;
        return (
          <span key={id}>
            <Handle id={`${id}s`} type="source" position={pos} className="!h-1 !w-1 !border-0 !bg-transparent" />
            <Handle id={`${id}t`} type="target" position={pos} className="!h-1 !w-1 !border-0 !bg-transparent" />
          </span>
        );
      })}
    </div>
  );
  return data.href ? <Link href={data.href}>{body}</Link> : body;
}

const nodeTypes = { hq: HqNode };

const n = (
  id: string,
  x: number,
  y: number,
  data: HqNodeData,
): Node<HqNodeData> => ({
  id,
  type: "hq",
  position: { x, y },
  data,
  draggable: true,
});

interface EdgeSpec {
  from: string;
  to: string;
  fromH?: "t" | "b" | "l" | "r";
  toH?: "t" | "b" | "l" | "r";
  animated?: boolean;
  tone?: Tone;
  label?: string;
}

const e = ({ from, to, fromH = "r", toH = "l", animated, tone = "dim", label }: EdgeSpec): Edge => ({
  id: `${from}->${to}`,
  source: from,
  target: to,
  sourceHandle: `${fromH}s`,
  targetHandle: `${toH}t`,
  animated: animated ?? false,
  label,
  labelStyle: { fill: "rgba(255,255,255,0.45)", fontSize: 9 },
  labelBgStyle: { fill: "#0d0e11", fillOpacity: 0.85 },
  style: {
    stroke:
      tone === "bad"
        ? "rgba(248,113,113,0.6)"
        : tone === "warn"
          ? "rgba(251,191,36,0.55)"
          : tone === "ok"
            ? "rgba(52,211,153,0.5)"
            : tone === "info"
              ? "rgba(57,135,229,0.55)"
              : "rgba(255,255,255,0.14)",
    strokeWidth: animated ? 1.6 : 1.1,
  },
});

const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const money = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
const ageLabel = (h: number | null) =>
  h === null ? "never" : h < 1 ? `${Math.round(h * 60)}m ago` : h < 48 ? `${h.toFixed(1)}h ago` : `${Math.floor(h / 24)}d ago`;

function buildGraph(f: Feed): { nodes: Node<HqNodeData>[]; edges: Edge[] } {
  const s = f.services;
  const b = f.billing;
  // Deadman thresholds: the watchdog runs every 2h and flags at 3h stale.
  const sweepTone: Tone =
    b.sweepAgeH === null ? "bad" : b.sweepAgeH > 3 ? "bad" : b.sweepAgeH > 1.5 ? "warn" : "ok";
  const flowing = b.sweepAgeH !== null && b.sweepAgeH <= 1.5;
  const cov = b.coverage;
  // Coverage outranks recency — the sweep read green through a 12-hour gap.
  const covTone: Tone =
    cov === null
      ? "dim"
      : cov.open === 0
        ? "dim"
        : cov.overBilled > 0
          ? "bad"
          : cov.missing === 0
            ? "ok"
            : cov.missing <= 2
              ? "warn"
              : "bad";
  const invTone: Tone = f.billing.invariantBad === null ? "dim" : f.billing.invariantBad > 0 ? "bad" : "ok";
  const failTone: Tone = (b.failuresUnresolved ?? 0) > 0 ? "bad" : "ok";
  const mainTone: Tone = f.providers.mainApp.up ? "ok" : "bad";
  const linodeTone: Tone =
    f.providers.linodeSyncAgeH === null ? "dim" : f.providers.linodeSyncAgeH > 48 ? "warn" : "ok";
  // A failed read is UNKNOWN (grey) — never green, never a healthy-looking zero.
  const svcTone = (v: number | null): Tone => (v === null ? "dim" : v > 0 ? "ok" : "dim");
  const svcSub = (v: number | null, sub: string) => (v === null ? "read failed" : sub);

  const nodes: Node<HqNodeData>[] = [
    // People
    n("customers", 0, 330, {
      label: "Customers",
      value: num(f.users.total),
      sub: `${num(f.users.new24h)} joined 24h`,
      tone: "info",
      href: "/users",
    }),
    n("operators", 0, 620, {
      label: "Operators",
      value: "3 admins",
      sub: "allowlist-gated",
      tone: "info",
    }),
    // Apps
    n("mainapp", 250, 330, {
      label: "Main App",
      value: f.providers.mainApp.up ? "up" : "DOWN",
      sub: f.providers.mainApp.ms !== null ? `ahurasense.com · ${f.providers.mainApp.ms}ms` : "unreachable",
      tone: mainTone,
    }),
    n("panel", 250, 620, {
      label: "Admin Panel",
      value: "up",
      sub: "control.ahurasense.com",
      tone: "ok",
    }),
    // Providers
    n("linode", 560, 20, {
      label: "Linode",
      value: linodeTone === "dim" ? "no sync" : "synced",
      sub: `catalog ${ageLabel(f.providers.linodeSyncAgeH)}`,
      tone: linodeTone,
      href: "/servers/linode",
    }),
    n("runpod", 790, 20, {
      label: "RunPod",
      value: "resale",
      sub: "GPU upstream",
      tone: "dim",
      href: "/gpu",
    }),
    // Services (billing's own active_* views)
    n("compute", 560, 150, { label: "Compute VMs", value: num(s.compute), sub: svcSub(s.compute, "active meters view"), tone: svcTone(s.compute), href: "/servers" }),
    n("gpu", 790, 150, {
      label: "GPU Pods",
      value: num(s.gpu),
      sub:
        b.gpuBooks === null
          ? svcSub(s.gpu, "books unverified")
          : b.gpuBooks.agrees
            ? "quote & charge books agree"
            : `BOOKS DISAGREE — charge ×${b.gpuBooks.chargeMarkup}`,
      tone: b.gpuBooks !== null && !b.gpuBooks.agrees ? "bad" : svcTone(s.gpu),
      href: "/gpu",
    }),
    n("database", 560, 255, { label: "Databases", value: num(s.database), sub: svcSub(s.database, "active"), tone: svcTone(s.database), href: "/databases" }),
    n("kubernetes", 790, 255, { label: "Kubernetes", value: num(s.kubernetes), sub: svcSub(s.kubernetes, "active"), tone: svcTone(s.kubernetes), href: "/kubernetes" }),
    n("objectspace", 560, 360, { label: "Object Storage", value: num(s.objectspace), sub: svcSub(s.objectspace, "active"), tone: svcTone(s.objectspace), href: "/object-storage" }),
    n("spectrum", 790, 360, { label: "Network / DDoS", value: num(s.spectrum), sub: svcSub(s.spectrum, "active"), tone: svcTone(s.spectrum), href: "/network-ddos" }),
    n("deploy", 560, 465, { label: "Deploy v2", value: num(s.deploy), sub: svcSub(s.deploy, "projects"), tone: svcTone(s.deploy), href: "/deploy" }),
    n("domains", 790, 465, { label: "Domains", value: num(s.domains), sub: svcSub(s.domains, "attached"), tone: svcTone(s.domains), href: "/domains" }),
    n("inference", 560, 570, { label: "AI / Inference", value: num(s.inference), sub: svcSub(s.inference, "active"), tone: svcTone(s.inference), href: "/ai" }),
    n("apps", 790, 570, { label: "Platform Apps", value: num(s.platform_apps), sub: svcSub(s.platform_apps, "active"), tone: svcTone(s.platform_apps) }),
    // Billing pipeline — coverage is the health signal; recency is context.
    n("pricebook", 1090, 60, {
      label: "Price Book",
      value: b.livePrices === null ? "—" : `${b.livePrices} live`,
      sub:
        b.unpricedSellable === null
          ? "coverage unknown"
          : b.unpricedSellable > 0
            ? `${b.unpricedSellable} sellable plans unpriced`
            : "every sellable plan covered",
      tone:
        b.livePrices === null
          ? "dim"
          : b.livePrices === 0
            ? "bad"
            : (b.unpricedSellable ?? 0) > 0
              ? "warn"
              : "ok",
      href: "/pricing",
      wide: true,
    }),
    n("meters", 1090, 205, {
      label: "Open Meters",
      value: num(b.openMeters),
      sub:
        f.billing.invariantBad === null
          ? "read failed"
          : f.billing.invariantBad > 0
            ? `${f.billing.invariantBad} status/ended_at DISAGREE`
            : "definitions agree",
      tone: invTone === "ok" ? "info" : invTone,
    }),
    n("coverage", 1090, 350, {
      label: "Billed Coverage · 7d",
      value:
        cov === null
          ? "unknown"
          : cov.open === 0
            ? "no open meters"
            : cov.missing === 0
              ? "fully billed"
              : `${cov.missing} hrs MISSING`,
      sub:
        cov === null
          ? "coverage read failed"
          : cov.open === 0
            ? "0 meters examined"
            : cov.overBilled > 0
              ? `${cov.overBilled} meter(s) OVER-billed — duplicate charge hours`
              : `${cov.billed}/${cov.expected} hrs · ${cov.open} meters${
                  cov.worst ? ` · worst: ${cov.worst.service_type} −${cov.worst.missing}h` : ""
                }`,
      tone: covTone,
      wide: true,
    }),
    n("sweep", 1090, 505, {
      label: "Sweep · last wrote",
      value: ageLabel(b.sweepAgeH),
      sub: `${b.chargeCount24h} charges · 24h · recency can lie, coverage cannot`,
      tone: sweepTone,
      wide: true,
    }),
    n("failures", 1090, 650, {
      label: "Billing Failures",
      value: num(b.failuresUnresolved),
      sub: b.failuresUnresolved === null ? "read failed" : "unresolved",
      tone: b.failuresUnresolved === null ? "dim" : failTone,
    }),
    n("ledger", 1400, 330, {
      label: "Ledger · 24h",
      value: `${b.charges24hTruncated ? "≥ " : ""}${money(b.charged24h)}`,
      sub: b.charges24hTruncated
        ? `first 1000 of ${b.chargeCount24h} charges — sum is partial`
        : `usage charged · topups ${money(b.topups24h)}`,
      tone: b.charges24hTruncated ? "warn" : "info",
      wide: true,
    }),
    n("coupons", 1400, 585, {
      label: "Coupons",
      value: b.liveCoupons === null ? "—" : `${b.liveCoupons} live`,
      sub:
        b.liveCoupons === null ? "read failed" : `${b.couponRedemptions24h} redeemed 24h`,
      tone: b.liveCoupons === null ? "dim" : "info",
      href: "/coupons",
    }),
    n("audit", 1400, 730, {
      label: "Audit Trail",
      value: f.audits.up ? `${num(f.audits.rows)} rows` : "DARK",
      sub: f.audits.up ? "reachable · probed live" : "unreachable — writes failing",
      tone: f.audits.up ? "ok" : "bad",
      href: "/audit-logs",
      wide: true,
    }),
  ];

  const serviceIds = [
    "compute",
    "gpu",
    "database",
    "kubernetes",
    "objectspace",
    "spectrum",
    "deploy",
    "domains",
    "inference",
    "apps",
  ];

  const edges: Edge[] = [
    e({ from: "customers", to: "mainapp", animated: true, tone: "info" }),
    e({ from: "operators", to: "panel", animated: true, tone: "info" }),
    e({ from: "linode", to: "compute", fromH: "b", toH: "t", tone: "dim" }),
    e({ from: "runpod", to: "gpu", fromH: "b", toH: "t", tone: "dim" }),
    // App → services: the left column of services takes the direct edges;
    // fanning to all ten reads as spaghetti, not signal.
    ...["compute", "database", "objectspace", "deploy", "inference"].map((id) =>
      e({ from: "mainapp", to: id, tone: "dim" }),
    ),
    e({ from: "panel", to: "pricebook", fromH: "b", toH: "l", tone: "info", label: "set prices" }),
    e({ from: "panel", to: "coupons", fromH: "b", toH: "b", tone: "info", label: "issue / kill" }),
    e({ from: "panel", to: "audit", fromH: "b", toH: "l", tone: f.audits.up ? "dim" : "bad", label: "audits" }),
    // Services → meters (right column feeds from its right side)
    ...serviceIds
      .filter((id) => id !== "deploy" && id !== "domains")
      .map((id) => e({ from: id, to: "meters", fromH: "r", toH: "l", tone: "dim" })),
    e({ from: "deploy", to: "ledger", fromH: "r", toH: "b", tone: "dim", label: "project charges" }),
    e({ from: "pricebook", to: "meters", fromH: "b", toH: "t", tone: "dim", label: "rates" }),
    e({ from: "meters", to: "coverage", fromH: "b", toH: "t", tone: "dim" }),
    e({
      from: "coverage",
      to: "sweep",
      fromH: "b",
      toH: "t",
      animated: flowing && (cov?.missing ?? 0) === 0,
      tone: covTone === "bad" ? "bad" : flowing ? "ok" : "warn",
    }),
    e({ from: "sweep", to: "ledger", fromH: "r", toH: "l", animated: flowing, tone: flowing ? "ok" : "warn", label: "hourly charges" }),
    e({ from: "sweep", to: "failures", fromH: "b", toH: "t", tone: failTone === "bad" ? "bad" : "dim" }),
    e({
      from: "coupons",
      to: "ledger",
      fromH: "t",
      toH: "b",
      animated: b.couponRedemptions24h > 0,
      tone: b.couponRedemptions24h > 0 ? "ok" : "dim",
      label: "credit",
    }),
  ];

  return { nodes, edges };
}

const POLL_MS = 12000;

export default function HqBoard() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/monitor", { cache: "no-store" });
      const data = (await res.json()) as Feed & { error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `feed returned ${res.status}`);
        return;
      }
      setFeed(data);
      setError(null);
      setFetchedAt(Date.now());
    } catch {
      setError("monitor feed unreachable");
    }
  }, []);

  useEffect(() => {
    void load();
    const start = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (document.visibilityState === "visible") void load();
      }, POLL_MS);
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // Re-render the "updated Xs ago" stamp each second without refetching.
  useEffect(() => {
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const graph = useMemo(() => (feed ? buildGraph(feed) : null), [feed]);

  if (!feed || !graph) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-xl border border-border bg-[#0d0e11]">
        <p className="text-sm text-muted-foreground">
          {error ? `HQ feed failed: ${error}` : "Bringing the board online…"}
        </p>
      </div>
    );
  }

  const staleS = fetchedAt ? Math.round((Date.now() - fetchedAt) / 1000) : null;

  return (
    <div className="flex h-[calc(100vh-170px)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-[#0b0c0f]">
      <div className="relative flex-1">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.3}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          elementsSelectable={false}
          colorMode="dark"
        >
          <Background color="rgba(255,255,255,0.05)" gap={28} size={1} />
        </ReactFlow>

        {/* Live status — top right */}
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2">
          {error && (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">
              refresh failing: {error}
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-[#111216]/90 px-2.5 py-1 text-[11px] text-white/60">
            <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-red-400" : "animate-pulse bg-emerald-400"}`} />
            LIVE · {staleS === null ? "—" : `${staleS}s ago`}
          </span>
        </div>

        {/* KPI strip — top left */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          {[
            {
              k: "charged 24h",
              v: `${feed.billing.charges24hTruncated ? "≥ " : ""}${money(feed.billing.charged24h)}`,
            },
            {
              k: "hrs unbilled",
              v: feed.billing.coverage === null ? "?" : String(feed.billing.coverage.missing),
              bad: (feed.billing.coverage?.missing ?? 0) > 0,
            },
            { k: "open meters", v: num(feed.billing.openMeters) },
            { k: "live prices", v: num(feed.billing.livePrices) },
            {
              k: "failures",
              v: num(feed.billing.failuresUnresolved),
              bad: (feed.billing.failuresUnresolved ?? 0) > 0,
            },
            { k: "users", v: num(feed.users.total) },
          ].map((kpi) => (
            <span
              key={kpi.k}
              className={`rounded-md border px-2.5 py-1.5 text-[11px] backdrop-blur ${
                kpi.bad
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-border bg-[#111216]/90 text-white/70"
              }`}
            >
              <span className="mr-1.5 uppercase tracking-wider text-white/35">{kpi.k}</span>
              <span className="font-heading font-semibold text-[12.5px]">{kpi.v}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Event ticker */}
      <div className="flex items-center gap-3 overflow-x-auto border-t border-border bg-[#0d0e11] px-3 py-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Wire
        </span>
        {feed.events.length === 0 ? (
          <span className="text-[11.5px] text-white/35">no billing events in the last 24h</span>
        ) : (
          feed.events.map((ev, i) => (
            <span
              key={`${ev.at}-${i}`}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${
                ev.tone === "bad"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : ev.tone === "warn"
                    ? "border-amber-500/35 bg-amber-500/[0.07] text-amber-200/90"
                    : "border-border bg-[#111216] text-white/60"
              }`}
            >
              <span className="mr-1.5 text-white/35">{ev.at.slice(11, 16)}</span>
              {ev.label}
              {ev.amount !== null && (
                <span className="ml-1.5 font-semibold text-white/80">{money(ev.amount)}</span>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
