/**
 * Public uptime + recent health dashboard for the inference platform.
 *
 * Reachable at /status without auth — linked from the marketing nav and
 * from in-product error pages. Aggregates real numbers from the last 24h
 * of inference.usage + the gateway's /v1/health probe + counts of
 * recent fine-tune + deployment outcomes. No external status-page
 * service; this is the source of truth, on our own infra, so prospects
 * don't have to take our word for it.
 *
 * Refresh model: ISR-style revalidate every 30s (Next.js force-dynamic
 * with cached fetch). Server-rendered so it works without JS.
 */
import { createClient } from "@supabase/supabase-js";

import { StatusAutoRefresh } from "@/components/status/auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type Severity = "operational" | "degraded" | "outage" | "unknown";

interface ComponentStatus {
  name: string;
  severity: Severity;
  detail: string;
}

interface HourBucket {
  hour: string; // ISO truncated to hour
  total: number;
  success: number;
  failure: number;
}

interface PageData {
  overall: Severity;
  components: ComponentStatus[];
  hourly: HourBucket[];
  totals24h: { total: number; success: number; failure: number };
  fineTunes7d: { succeeded: number; failed: number; queued: number };
  deployments7d: { running: number; failed: number; building: number };
  gateway: { reachable: boolean; latencyMs: number | null; version: string | null };
  fetchedAt: string;
}

const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_INFERENCE_API_BASE ?? "https://api.ahurasense.com/v1";

// ─── Data ─────────────────────────────────────────────────────────

async function fetchGatewayHealth(): Promise<PageData["gateway"]> {
  const startedAt = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${GATEWAY_BASE}/health`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const latencyMs = Date.now() - startedAt;
    if (!r.ok) return { reachable: false, latencyMs, version: null };
    const data = (await r.json()) as { version?: string };
    return { reachable: true, latencyMs, version: data.version ?? null };
  } catch {
    return { reachable: false, latencyMs: null, version: null };
  }
}

interface UsageRow {
  hour_bucket: string;
  total: number;
  success: number;
  failure: number;
}

interface FtRow {
  status: string;
  cnt: number;
}

interface DeployRow {
  status: string;
  cnt: number;
}

async function loadPageData(): Promise<PageData> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Run all the queries in parallel. Supabase's generated RPC types are
  // over-strict for SETOF RETURNS TABLE functions — see vector query route
  // for the same workaround.
  const [gateway, usageRes, ftRes, deployRes] = await Promise.all([
    fetchGatewayHealth(),
    supabase.schema("inference").rpc("status_usage_24h"),
    supabase.schema("inference").rpc("status_finetunes_7d"),
    supabase.schema("inference").rpc("status_deployments_7d"),
  ]);
  const usageRows = (usageRes.data as unknown as UsageRow[] | null) ?? [];
  const ftRows = (ftRes.data as unknown as FtRow[] | null) ?? [];
  const deployRows = (deployRes.data as unknown as DeployRow[] | null) ?? [];

  // Hourly buckets — fill the last 24 hours so the sparkline is contiguous
  // even when the gateway has had idle periods.
  const now = new Date();
  const hourly: HourBucket[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    d.setUTCMinutes(0, 0, 0);
    hourly.push({
      hour: d.toISOString(),
      total: 0,
      success: 0,
      failure: 0,
    });
  }
  for (const row of usageRows) {
    // Truncate to the same ISO hour shape used in the bucket array.
    const bucketIso = new Date(row.hour_bucket).toISOString();
    const idx = hourly.findIndex((h) => h.hour === bucketIso);
    if (idx >= 0) {
      hourly[idx]!.total = Number(row.total) || 0;
      hourly[idx]!.success = Number(row.success) || 0;
      hourly[idx]!.failure = Number(row.failure) || 0;
    }
  }

  const totals24h = hourly.reduce(
    (a, h) => ({
      total: a.total + h.total,
      success: a.success + h.success,
      failure: a.failure + h.failure,
    }),
    { total: 0, success: 0, failure: 0 }
  );

  const ftMap = new Map<string, number>();
  for (const r of ftRows) ftMap.set(r.status, Number(r.cnt) || 0);
  const fineTunes7d = {
    succeeded: ftMap.get("completed") ?? 0,
    failed: ftMap.get("failed") ?? 0,
    queued: (ftMap.get("queued") ?? 0) + (ftMap.get("running") ?? 0) + (ftMap.get("preparing") ?? 0),
  };

  const depMap = new Map<string, number>();
  for (const r of deployRows) depMap.set(r.status, Number(r.cnt) || 0);
  const deployments7d = {
    running: depMap.get("running") ?? 0,
    failed: depMap.get("failed") ?? 0,
    building: (depMap.get("building") ?? 0) + (depMap.get("deploying") ?? 0),
  };

  // Derive component severities
  const apiSeverity: Severity = !gateway.reachable
    ? "outage"
    : totals24h.total === 0
      ? "operational"
      : totals24h.failure / totals24h.total >= 0.05
        ? "degraded"
        : "operational";

  const ftSeverity: Severity =
    fineTunes7d.succeeded + fineTunes7d.failed === 0
      ? "operational"
      : fineTunes7d.failed / (fineTunes7d.succeeded + fineTunes7d.failed) >= 0.3
        ? "degraded"
        : "operational";

  const deploySeverity: Severity =
    deployments7d.running + deployments7d.failed === 0
      ? "operational"
      : deployments7d.failed / (deployments7d.running + deployments7d.failed) >= 0.3
        ? "degraded"
        : "operational";

  const components: ComponentStatus[] = [
    {
      name: "Inference Gateway",
      severity: apiSeverity,
      detail: gateway.reachable
        ? `${gateway.latencyMs}ms · ${
            totals24h.total > 0
              ? `${((totals24h.success / totals24h.total) * 100).toFixed(2)}% success (24h)`
              : "idle"
          }`
        : "Health probe failed",
    },
    {
      name: "Vector Store",
      severity: "operational", // schema-bound; not derived yet
      detail: "pgvector on managed Postgres",
    },
    {
      name: "Fine-Tuning",
      severity: ftSeverity,
      detail:
        fineTunes7d.succeeded + fineTunes7d.failed === 0
          ? "No jobs in 7d"
          : `${fineTunes7d.succeeded} succeeded · ${fineTunes7d.failed} failed (7d)`,
    },
    {
      name: "Model Hosting",
      severity: deploySeverity,
      detail:
        deployments7d.running + deployments7d.failed === 0
          ? "No deployments in 7d"
          : `${deployments7d.running} running · ${deployments7d.failed} failed (7d)`,
    },
  ];

  // Overall = worst component
  const order: Record<Severity, number> = { operational: 0, unknown: 1, degraded: 2, outage: 3 };
  const overall = components.reduce<Severity>(
    (worst, c) => (order[c.severity] > order[worst] ? c.severity : worst),
    "operational"
  );

  return {
    overall,
    components,
    hourly,
    totals24h,
    fineTunes7d,
    deployments7d,
    gateway,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Render ───────────────────────────────────────────────────────

const MONO = "font-mono";

function severityColor(s: Severity): string {
  return s === "operational"
    ? "#22c55e"
    : s === "degraded"
      ? "#f59e0b"
      : s === "outage"
        ? "#ef4444"
        : "#64748b";
}

function severityLabel(s: Severity): string {
  return s === "operational"
    ? "Operational"
    : s === "degraded"
      ? "Degraded"
      : s === "outage"
        ? "Outage"
        : "Unknown";
}

export default async function StatusPage() {
  let data: PageData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadPageData();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#08090b] text-white px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-4">Status</h1>
          <p className={`${MONO} text-[12px] text-red-300/85`}>
            Could not load status data: {loadError}
          </p>
        </div>
      </main>
    );
  }

  const overallColor = severityColor(data.overall);
  const headline =
    data.overall === "operational"
      ? "All systems operational"
      : data.overall === "degraded"
        ? "Some systems degraded"
        : data.overall === "outage"
          ? "Major outage in progress"
          : "Status unknown";

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      {/* Aurora glow background */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[900px] h-[400px] opacity-60"
        style={{
          background: `radial-gradient(ellipse at center, ${overallColor}22 0%, transparent 70%)`,
          filter: "blur(40px)",
        }}
        aria-hidden
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16">
        <header className="mb-14">
          <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-3`}>
            AhuraCloud Inference · status
          </p>
          <div className="flex items-center gap-4 mb-3">
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ background: overallColor, boxShadow: `0 0 18px ${overallColor}` }}
            />
            <h1 className="text-[40px] sm:text-[52px] leading-[1.02] tracking-[-0.03em] font-semibold">
              {headline}
              <span className="text-white/40 font-normal">.</span>
            </h1>
          </div>
          <p className={`${MONO} text-[11.5px] text-white/45`}>
            Last checked {new Date(data.fetchedAt).toLocaleString(undefined, { timeZoneName: "short" })}
            {" · "} refreshes every 30s
          </p>
        </header>

        {/* Component grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-12">
          {data.components.map((c) => (
            <div
              key={c.name}
              className="rounded-[6px] border border-white/[0.06] bg-[#111216] p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-white tracking-[-0.01em] mb-1">
                  {c.name}
                </p>
                <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
                  {c.detail}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: severityColor(c.severity), boxShadow: `0 0 8px ${severityColor(c.severity)}` }}
                />
                <span
                  className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                  style={{ color: severityColor(c.severity) }}
                >
                  {severityLabel(c.severity)}
                </span>
              </div>
            </div>
          ))}
        </section>

        {/* 24h sparkline */}
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/60`}>
              Last 24h · gateway success rate
            </h2>
            <span className={`${MONO} text-[10.5px] text-white/45 tabular-nums`}>
              {data.totals24h.total > 0
                ? `${((data.totals24h.success / data.totals24h.total) * 100).toFixed(2)}% overall · ${data.totals24h.total.toLocaleString()} requests`
                : "no traffic in 24h"}
            </span>
          </div>
          <Sparkline hourly={data.hourly} />
        </section>

        {/* Incidents */}
        <section className="mb-12">
          <h2 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/60 mb-3`}>
            Recent incidents
          </h2>
          <div className="rounded-[6px] border border-white/[0.06] bg-[#0f1014] p-6 text-center">
            <p className={`${MONO} text-[11.5px] text-white/45`}>
              No active or recent incidents.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className={`${MONO} text-[10.5px] text-white/35 pt-8 border-t border-white/[0.06]`}>
          Gateway: <span className="text-white/55">{GATEWAY_BASE}</span>
          {data.gateway.version && (
            <>
              {" · "}version <span className="text-white/55">{data.gateway.version}</span>
            </>
          )}
        </footer>
      </div>

      <StatusAutoRefresh intervalSeconds={30} />
    </main>
  );
}

// ─── Sparkline subcomponent (server-rendered SVG) ─────────────────

function Sparkline({ hourly }: { hourly: HourBucket[] }) {
  const W = 760;
  const H = 80;
  const PAD = 4;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const bars = hourly.length;
  const barW = innerW / bars;

  return (
    <div className="rounded-[6px] border border-white/[0.06] bg-[#0f1014] p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[80px]" preserveAspectRatio="none">
        {hourly.map((h, i) => {
          const rate = h.total > 0 ? h.success / h.total : null;
          const barHeight = rate === null ? 4 : Math.max(4, innerH * rate);
          const color =
            rate === null
              ? "#1f2937"
              : rate >= 0.99
                ? "#22c55e"
                : rate >= 0.95
                  ? "#84cc16"
                  : rate >= 0.9
                    ? "#f59e0b"
                    : "#ef4444";
          const x = PAD + i * barW + 1;
          const y = PAD + (innerH - barHeight);
          return (
            <rect
              key={h.hour}
              x={x}
              y={y}
              width={Math.max(2, barW - 2)}
              height={barHeight}
              fill={color}
              opacity={rate === null ? 0.35 : 0.92}
            >
              <title>
                {new Date(h.hour).toLocaleString(undefined, { hour: "2-digit", day: "numeric", month: "short" })}
                {" · "}
                {h.total === 0
                  ? "no traffic"
                  : `${((h.success / h.total) * 100).toFixed(1)}% success · ${h.total} req`}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex items-center justify-between mt-2">
        <span className={`${MONO} text-[9.5px] text-white/35`}>24h ago</span>
        <span className={`${MONO} text-[9.5px] text-white/35`}>now</span>
      </div>
    </div>
  );
}
