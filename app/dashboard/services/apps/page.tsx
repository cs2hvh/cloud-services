"use client";

// Applications overview — editorial canvas (aurora + dotted grid),
// Nunito-accent title, mono labels, brand-blue accent. Magazine-style
// horizontal stats strip, floating PNG feature illustrations, and a
// clean app inventory.

import { ChevronRight, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppsList } from "@/components/dashboard/apps";
import { mergeDeploymentPresentation } from "@/components/dashboard/apps/types";
import { useRealtimeApps } from "@/hooks/use-realtime-apps";
import { useAppBuildState } from "@/hooks/use-app-build-state";
import { createClient } from "@/lib/supabase/client";
import api from "@/lib/axios/axios";

// ─── Design tokens ──────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

// ─── Static reference data ──────────────────────────────────────

const FEATURES = [
  {
    title: "Auto-detect from repo",
    desc: "Next.js, Vite, Vue, SvelteKit, Django, FastAPI — we read your repo and build it.",
    image: "/images/kubernetes-ui/gitops ready.png",
  },
  {
    title: "Fully managed runtime",
    desc: "Container builds, TLS certificates, health checks, and zero-downtime rollouts.",
    image: "/images/kubernetes-ui/fully managed.png",
  },
  {
    title: "Auto-scaling instances",
    desc: "Scales up under load and back down idle. Pay per second, not per slot.",
    image: "/images/kubernetes-ui/auto scaling nodespng.png",
  },
  {
    title: "Built-in load balancing",
    desc: "Layer-7 routing with sticky sessions, blue-green deploys, and instant rollback.",
    image: "/images/kubernetes-ui/Built in load balancing png.png",
  },
  {
    title: "Global CDN",
    desc: "Static assets served from 150+ edge POPs with brotli compression by default.",
    image: "/images/kubernetes-ui/Global CDN Integration.png",
  },
  {
    title: "99.99% uptime",
    desc: "Multi-AZ replicas, automatic failover, and per-revision lifecycle tracking.",
    image: "/images/kubernetes-ui/11 nine.png",
  },
] as const;

const formatRelativeTime = (dateString?: string) => {
  if (!dateString) return "No deployments yet";
  const createdAt = new Date(dateString);
  const seconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return createdAt.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function ApplicationDeploymentPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [localApps, setLocalApps] = useState<typeof realtimeApps>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    })();
  }, []);

  const {
    apps: realtimeApps,
    loading,
    connectionStatus,
  } = useRealtimeApps({
    userId: userId || "",
    enabled: !!userId,
    limit: 100,
  });

  useEffect(() => {
    setLocalApps((prev) => {
      if (prev.length === 0) return realtimeApps;
      const prevMap = new Map(prev.map((a) => [a.id, a]));
      return realtimeApps.map((app) =>
        mergeDeploymentPresentation(app, prevMap.get(app.id)),
      );
    });
  }, [realtimeApps]);

  const rollbackRefreshKey = useMemo(
    () =>
      realtimeApps
        .map((app) => `${app.id}:${app.status}:${app.updated_at ?? ""}`)
        .join("|"),
    [realtimeApps],
  );

  useEffect(() => {
    if (realtimeApps.length === 0) return;
    api
      .get("/services/platform-apps/list")
      .then((res) => {
        if (res?.data?.apps) {
          const map = new Map(
            (
              res?.data?.apps as Array<{
                id: string;
                can_rollback?: boolean;
                serving_build_number?: number | null;
                last_operation_build_number?: number | null;
                last_operation_trigger?: string | null;
                rollback_target_build_number?: number | null;
                rollback_target_commit_sha?: string | null;
              }>
            ).map((app) => [app.id, app]),
          );
          setLocalApps((prev) =>
            prev.map((app) =>
              mergeDeploymentPresentation(app, map.get(app.id)),
            ),
          );
        }
      })
      .catch(() => {});
  }, [rollbackRefreshKey, realtimeApps]);

  const deployedApps = localApps;

  const handleUpdateApps = (
    updater: (apps: typeof localApps) => typeof localApps,
  ) => {
    setLocalApps(updater);
  };

  const { buildInfo, buildLogs, logsLoading, logsError, fetchBuildLogs } =
    useAppBuildState(deployedApps);

  const runningApps = deployedApps.filter(
    (app) =>
      !buildInfo[app.name]?.building &&
      (app.status === "running" ||
        (app.serving_build_number != null &&
          app.status !== "deleting" &&
          app.status !== "building")),
  ).length;
  const buildingApps = deployedApps.filter(
    (app) => app.status === "building" || buildInfo[app.name]?.building,
  ).length;
  const successRate =
    deployedApps.length > 0
      ? `${Math.round((runningApps / deployedApps.length) * 100)}%`
      : "100%";

  const newestDeployment = useMemo(() => {
    if (deployedApps.length === 0) return null;
    return [...deployedApps].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [deployedApps]);

  const liveConnection = connectionStatus === "connected";

  if (loading && userId && deployedApps.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16 text-white">
        <div className="flex items-center gap-3 text-white/55">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className={`${MONO} text-[11.5px] uppercase tracking-[0.14em]`}>
            Loading applications
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
        {/* ── Hero ────────────────────────────────────────── */}
        <header className="mb-14">
          <div className="max-w-2xl">
            <h1 className="text-[40px] sm:text-[52px] leading-[1.02] tracking-[-0.03em] text-white font-semibold">
              Deploy and operate{" "}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                application workloads
              </span>
              .
            </h1>
            <p
              className={`${MONO} mt-4 max-w-md text-[11.5px] text-white/45 leading-relaxed`}
            >
              Repository-backed deployments with live build status, runtime
              metrics, and one-click rollbacks.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Link
                href="/dashboard/services/apps/new"
                className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                style={{
                  background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                  color: "#ffffff",
                  boxShadow:
                    "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                  e.currentTarget.style.transform = "none";
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Deploy application
              </Link>
              <Link
                href="#inventory"
                className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] text-white/65 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[5px] transition-colors`}
              >
                View inventory
              </Link>
            </div>
          </div>
        </header>

        {/* ── Stats — horizontal divider strip ─────────────── */}
        <section className="mb-16 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
          <StatCell
            label="Total apps"
            value={String(deployedApps.length)}
            hint="Deployment targets"
          />
          <StatCell
            label="Healthy"
            value={String(runningApps)}
            suffix={
              deployedApps.length > 0 ? `/ ${deployedApps.length}` : undefined
            }
            hint="Serving live traffic"
            accent="#4ade80"
          />
          <StatCell
            label="Active builds"
            value={String(buildingApps)}
            hint="Builds or rollouts in flight"
            accent={ACCENT}
          />
          <StatCell
            label="Success rate"
            value={successRate}
            hint={
              newestDeployment
                ? `Last: ${formatRelativeTime(newestDeployment.created_at)}`
                : "No deployments yet"
            }
          />
        </section>

        {/* ── Platform features ───────────────────────────── */}
        <SectionHead
          eyebrow="Why platform apps"
          title="Engineered"
          accent="for production"
          link={{ label: "Read the docs", href: "#" }}
        />
        <div className="mb-16 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6">
          {FEATURES.map((f, i) => (
            <FeatureCell key={f.title} index={i} {...f} />
          ))}
        </div>

        <style>{`
          @keyframes floaty {
            0%, 100% { transform: translateY(0px); }
            50%      { transform: translateY(-6px); }
          }
        `}</style>

        {/* ── Inventory ───────────────────────────────────── */}
        <div id="inventory">
          <SectionHead
            eyebrow="Application inventory"
            title="Your"
            accent="deployments"
            rightMeta={
              deployedApps.length > 0
                ? `${runningApps} healthy · ${buildingApps} building · ${deployedApps.length} total`
                : liveConnection
                  ? "Live updates"
                  : undefined
            }
          />
          <AppsList
            apps={deployedApps}
            loading={loading}
            buildInfo={buildInfo}
            buildLogs={buildLogs}
            logsLoading={logsLoading}
            logsError={logsError}
            onFetchLogs={fetchBuildLogs}
            onUpdateApps={handleUpdateApps}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function SectionHead({
  eyebrow,
  title,
  accent,
  link,
  rightMeta,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  link?: { label: string; href: string };
  rightMeta?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p
          className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}
        >
          {eyebrow}
        </p>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {title}{" "}
          <span style={SERIF_STYLE} className="text-white/55 font-normal">
            {accent}
          </span>
          <span className="text-white/55 font-normal">.</span>
        </h2>
      </div>
      <div className="flex items-center gap-4">
        {rightMeta && (
          <span
            className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 tabular-nums`}
          >
            {rightMeta}
          </span>
        )}
        {link && (
          <Link
            href={link.href}
            className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/50 hover:text-[#0095FF] transition-colors`}
          >
            {link.label}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  suffix,
  hint,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="px-5 py-5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className="h-1 w-1 rounded-full shrink-0"
          style={{
            background: accent ?? "rgba(255,255,255,0.55)",
            boxShadow: accent ? `0 0 5px ${accent}` : "none",
          }}
        />
        <span
          className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[40px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
        >
          {value}
        </span>
        {suffix && (
          <span style={SERIF_STYLE} className="text-[16px] text-white/40 font-medium">
            {suffix}
          </span>
        )}
      </div>
      <p className={`${MONO} text-[10.5px] text-white/40`}>{hint}</p>
    </div>
  );
}

function FeatureCell({
  index,
  title,
  desc,
  image,
}: {
  index: number;
  title: string;
  desc: string;
  image: string;
}) {
  return (
    <div className="flex items-start gap-4 py-2">
      <div
        className="relative h-20 w-20 shrink-0 flex items-center justify-center"
        style={{
          animation: `floaty 5s ease-in-out infinite ${(index % 6) * 0.5}s`,
        }}
      >
        <div
          className="absolute inset-0 blur-xl opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.18), transparent 60%)",
          }}
        />
        <Image
          src={image}
          alt=""
          width={80}
          height={80}
          className="relative object-contain"
          unoptimized
        />
      </div>
      <div className="min-w-0 pt-1.5">
        <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-1.5">
          {title}
        </h3>
        <p className="text-[12px] text-white/55 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
