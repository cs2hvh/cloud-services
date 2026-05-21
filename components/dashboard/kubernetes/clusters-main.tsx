"use client";

// Kubernetes overview page — editorial canvas (aurora + dotted grid),
// Nunito accent title, mono labels, subtle rounded corners, brand-blue
// accent. Hero + 4-stat strip + provisioning presets + supported
// versions + 2-col operational view (events + region availability) +
// cluster inventory (table or empty state).

import {
  Activity, Box, Boxes, ChevronRight, Clock, Cpu, Download,
  GitBranch, Loader2, Plus, RefreshCw, ShieldCheck, Terminal, Zap,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Tables } from "@/lib/supabase/types";

// ─── Design tokens (scoped) ────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
const ACCENT_DIM = "rgba(0,149,255,0.08)";

type ClusterData = Tables<"clusters_get">;

interface KubernetesClustersProps {
  clusters: ClusterData[];
}

// ─── Static reference data (matches mockup) ────────────────────────

const PRESETS = [
  {
    name: "Development",
    desc: "Single-node cluster for testing and lightweight workloads",
    specs: ["1 node", "2 vCPU", "4 GB"],
  },
  {
    name: "Production HA",
    desc: "3-node cluster with HA control plane and autoscaling",
    specs: ["3 nodes", "4 vCPU", "16 GB"],
    featured: true,
  },
  {
    name: "GPU Inference",
    desc: "Mixed cluster with NVIDIA GPU nodes for ML serving",
    specs: ["2+1 nodes", "A100"],
  },
  {
    name: "High-Performance",
    desc: "Large nodes for batch processing and compute-intensive jobs",
    specs: ["3 nodes", "16 vCPU", "64 GB"],
  },
] as const;

const VERSIONS = [
  {
    num: "v1.31",
    tag: "Stable",
    color: "#4ade80",
    meta: "Released Aug 2024 · Patch v1.31.4",
    features: "Native sidecar containers · structured logging · CEL admission policies",
  },
  {
    num: "v1.30",
    tag: "LTS",
    color: ACCENT,
    meta: "Released Apr 2024 · Supported until Aug 2026",
    features: "Recommended for production · long-term support guarantee",
  },
  {
    num: "v1.28",
    tag: "EOL Soon",
    color: "#fbbf24",
    meta: "Released Aug 2023 · Support ends Oct 2025",
    features: "Plan migration to v1.30 or v1.31 before deprecation",
  },
] as const;

const REGIONS = [
  { city: "Bengaluru",   code: "BLR", zones: 3 },
  { city: "Frankfurt",   code: "FRA", zones: 3 },
  { city: "Singapore",   code: "SIN", zones: 2 },
  { city: "Virginia",    code: "IAD", zones: 3 },
  { city: "Tokyo",       code: "NRT", zones: 2 },
] as const;

// ─── Helpers ───────────────────────────────────────────────────────

const downloadKubeconfig = async (clusterId: string) => {
  try {
    const res = await fetch("/api/services/kubernetes/clusters/downloadkube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cluster_id: clusterId }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const blob = new Blob([data.data], { type: "application/x-yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clusterId}.yaml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error("Failed to download kubeconfig.");
  }
};

function statusMeta(status?: string | null): { dot: string; label: string } {
  const v = (status || "unknown").toLowerCase();
  if (v === "ready") return { dot: "bg-emerald-400", label: "Ready" };
  if (v === "pending" || v === "creating") return { dot: "bg-amber-400", label: "Pending" };
  if (v === "failed") return { dot: "bg-red-400", label: "Failed" };
  return { dot: "bg-white/30", label: v.charAt(0).toUpperCase() + v.slice(1) };
}

// ─── Component ─────────────────────────────────────────────────────

const KubernetesClustersMain = ({ clusters }: KubernetesClustersProps) => {
  const ready = clusters.filter((c) => c.status === "ready").length;
  const activeNodes = clusters.reduce(
    (sum, c) => sum + (c.workers?.length || 0) + 1,
    0
  );
  const versions = new Set(clusters.map((c) => c.k8s_version).filter(Boolean)).size;

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)" }}
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

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        {/* ── Hero ─────────────────────────────────────────── */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-8">
          <div className="max-w-3xl">
            <div className={`${MONO} mb-3 inline-flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              <span className="h-px w-4 bg-white/45" />
              Kubernetes Service
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-emerald-400/25 bg-emerald-400/[0.06] text-[9.5px] font-semibold text-emerald-300 rounded-[5px]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #4ade80" }} />
                Operational
              </span>
            </div>
            <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
              Managed clusters{" "}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">
                for platform workloads
              </span>
            </h1>
            <p className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}>
              Provision, monitor, and operate Kubernetes with managed control planes,
              autoscaling node pools, and direct kubectl access.
            </p>
          </div>
          <Link
            href="/dashboard/services/kubernetes/new"
            className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold transition-all rounded-[5px] shrink-0`}
            style={{
              background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
              color: "#ffffff",
              boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
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
            New cluster
          </Link>
        </header>

        {/* ── Stats strip ──────────────────────────────────── */}
        <section className="mb-10 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StatTile
            label="Total clusters"
            value={String(clusters.length)}
            hint="Provisioned environments"
            icon={<Boxes className="h-3.5 w-3.5" />}
          />
          <StatTile
            label="Healthy"
            value={`${ready}`}
            suffix={`/ ${clusters.length || 0}`}
            hint="Ready to accept workloads"
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            tone="green"
          />
          <StatTile
            label="Active nodes"
            value={String(activeNodes)}
            hint="Control plane + workers"
            icon={<Cpu className="h-3.5 w-3.5" />}
            tone="blue"
          />
          <StatTile
            label="Versions in use"
            value={versions > 0 ? String(versions) : "—"}
            hint="K8s versions across clusters"
            icon={<GitBranch className="h-3.5 w-3.5" />}
          />
        </section>

        {/* ── Presets ──────────────────────────────────────── */}
        <SectionHead
          eyebrow="Quick provision"
          title="Start from a"
          accent="preset"
          link={{ label: "Or configure custom", href: "/dashboard/services/kubernetes/new" }}
        />
        <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {PRESETS.map((p) => (
            <PresetCard key={p.name} {...p} />
          ))}
        </div>

        {/* ── Versions ─────────────────────────────────────── */}
        <SectionHead eyebrow="Supported versions" title="Kubernetes" accent="channels" />
        <div className="mb-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {VERSIONS.map((v) => (
            <div
              key={v.num}
              className="border border-white/[0.06] bg-[#111216] p-4 rounded-[5px] flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  style={SERIF_STYLE}
                  className="text-[20px] leading-none font-bold tracking-[-0.02em] tabular-nums text-white"
                >
                  {v.num}
                </span>
                <span
                  className={`${MONO} text-[9px] uppercase tracking-[0.12em] font-semibold border px-1.5 py-px rounded-[4px]`}
                  style={{
                    color: v.color,
                    borderColor: `${v.color}40`,
                    background: `${v.color}10`,
                  }}
                >
                  {v.tag}
                </span>
              </div>
              <p className={`${MONO} text-[10.5px] text-white/45`}>{v.meta}</p>
              <p className="text-[11.5px] text-white/55 leading-snug">{v.features}</p>
            </div>
          ))}
        </div>

        {/* ── Operational view (2-col) ─────────────────────── */}
        <SectionHead
          eyebrow="Operational view"
          title="Control plane"
          accent="status"
          link={{ label: "View status page", href: "#" }}
        />
        <div className="mb-10 grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-2.5">
          {/* Recent events */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <h3 className="text-[13px] font-semibold text-white">Recent cluster events</h3>
              <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45 hover:text-white cursor-pointer`}>
                View all
              </span>
            </header>
            <div className="px-5 py-2">
              <FeedRow
                icon={<Boxes className="h-3.5 w-3.5" />}
                title={clusters.length === 0 ? "No clusters provisioned" : `${clusters.length} cluster${clusters.length === 1 ? "" : "s"} active`}
                meta={
                  clusters.length === 0
                    ? "Create your first cluster to see lifecycle and node events here"
                    : "Lifecycle events stream in here in real time"
                }
              />
              <FeedRow
                icon={<Clock className="h-3.5 w-3.5" />}
                title="Node pool · awaiting provision"
                meta="Worker pools and autoscaling events will appear here"
                dim
              />
              <FeedRow
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                title="Upgrade · no clusters to upgrade"
                meta="Control plane and node upgrades will be tracked here"
                dim
              />
            </div>
          </div>

          {/* Region availability */}
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <h3 className="text-[13px] font-semibold text-white">Region availability</h3>
              <span className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-emerald-300/85`}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #4ade80" }} />
                All operational
              </span>
            </header>
            <div className="px-5 py-2">
              {REGIONS.map((r) => (
                <div
                  key={r.code}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2.5 border-b border-dashed border-white/[0.06] last:border-b-0"
                >
                  <span className="text-[12.5px] text-white flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {r.city}
                  </span>
                  <span className={`${MONO} text-[10.5px] text-white/50`}>
                    {r.code} · {r.zones} zones
                  </span>
                  <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-emerald-300/75`}>
                    Ready
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Inventory ────────────────────────────────────── */}
        <SectionHead eyebrow="Cluster inventory" title="Your" accent="clusters" />
        {clusters.length > 0 ? (
          <ClusterTable clusters={clusters} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
};

export default KubernetesClustersMain;

// ─── Subcomponents ─────────────────────────────────────────────────

function SectionHead({
  eyebrow,
  title,
  accent,
  link,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  link?: { label: string; href: string };
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}>
          {eyebrow}
        </p>
        <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-white">
          {title}{" "}
          <span style={SERIF_STYLE} className="text-white/55 font-normal">
            {accent}
          </span>
        </h2>
      </div>
      {link && (
        <Link
          href={link.href}
          className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/50 hover:text-white transition-colors`}
        >
          {link.label}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "blue" | "green";
}) {
  const iconTone =
    tone === "blue"
      ? { color: ACCENT, background: ACCENT_DIM, borderColor: "rgba(0,149,255,0.2)" }
      : tone === "green"
        ? { color: "#4ade80", background: "rgba(74,222,128,0.06)", borderColor: "rgba(74,222,128,0.2)" }
        : { color: "rgba(255,255,255,0.55)", background: "#0d0e11", borderColor: "rgba(255,255,255,0.08)" };
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[5px] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
          {label}
        </span>
        <span
          className="h-6 w-6 inline-flex items-center justify-center border rounded-[4px]"
          style={iconTone}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[34px] leading-none font-bold tabular-nums tracking-[-0.03em] text-white"
        >
          {value}
        </span>
        {suffix && (
          <span style={SERIF_STYLE} className="text-[16px] text-white/45 font-medium">
            {suffix}
          </span>
        )}
      </div>
      <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{hint}</p>
    </div>
  );
}

function PresetCard({
  name,
  desc,
  specs,
  featured,
}: {
  name: string;
  desc: string;
  specs: readonly string[];
  featured?: boolean;
}) {
  return (
    <Link
      href="/dashboard/services/kubernetes/new"
      className="group relative border rounded-[5px] p-4 flex flex-col gap-3 transition-all overflow-hidden"
      style={
        featured
          ? {
              borderColor: ACCENT,
              background: "linear-gradient(135deg, #111216 0%, rgba(0,149,255,0.05) 100%)",
              boxShadow: `0 0 0 1px ${ACCENT}, 0 6px 18px rgba(0,149,255,0.08)`,
            }
          : { borderColor: "rgba(255,255,255,0.06)", background: "#111216" }
      }
      onMouseEnter={(e) => {
        if (featured) return;
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        e.currentTarget.style.background = "#16181d";
      }}
      onMouseLeave={(e) => {
        if (featured) return;
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
        e.currentTarget.style.background = "#111216";
      }}
    >
      {featured && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ background: ACCENT }}
        />
      )}
      <div className="flex items-center justify-between">
        <span
          className="h-8 w-8 inline-flex items-center justify-center border rounded-[4px]"
          style={
            featured
              ? { background: ACCENT_DIM, borderColor: "rgba(0,149,255,0.25)", color: ACCENT }
              : { background: "#0d0e11", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }
          }
        >
          <Box className="h-4 w-4" />
        </span>
        {featured ? (
          <span
            className={`${MONO} text-[9px] uppercase tracking-[0.14em] font-semibold px-1.5 py-px rounded-[4px]`}
            style={{ background: ACCENT_DIM, color: ACCENT, border: `1px solid rgba(0,149,255,0.25)` }}
          >
            Popular
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-[#0095FF] transition-colors group-hover:translate-x-0.5" />
        )}
      </div>
      <div>
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-white">{name}</div>
        <p className={`${MONO} mt-1 text-[10.5px] text-white/45 leading-snug`}>{desc}</p>
      </div>
      <div className={`${MONO} mt-auto flex items-center gap-2 text-[10px] text-white/40 tabular-nums`}>
        {specs.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className="text-white/70">{s}</span>
            {i < specs.length - 1 && <span className="text-white/15">·</span>}
          </span>
        ))}
      </div>
    </Link>
  );
}

function FeedRow({
  icon,
  title,
  meta,
  dim,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  dim?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 border-b border-dashed border-white/[0.06] last:border-b-0 ${dim ? "opacity-50" : ""}`}
    >
      <div className="h-7 w-7 shrink-0 inline-flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] text-white/55 rounded-[4px]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[12.5px] font-medium ${dim ? "text-white/45" : "text-white"} tracking-[-0.005em]`}>
          {title}
        </p>
        <p className={`${MONO} text-[10.5px] text-white/40 mt-0.5`}>{meta}</p>
      </div>
    </div>
  );
}

// ─── Cluster table ─────────────────────────────────────────────────

function ClusterTable({ clusters }: { clusters: ClusterData[] }) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
        <ColHead>Cluster</ColHead>
        <ColHead>Nodes</ColHead>
        <ColHead>Version</ColHead>
        <ColHead>Status</ColHead>
        <ColHead align="right">Actions</ColHead>
      </div>
      {clusters.map((c) => {
        const s = statusMeta(c.status);
        const nodeCount = (c.workers?.length || 0) + 1;
        return (
          <div
            key={c.cluster_id}
            className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] md:items-center"
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white truncate">{c.cluster_name}</div>
              <div className={`${MONO} mt-0.5 text-[10.5px] text-white/30 truncate`}>
                {c.cluster_id}
              </div>
            </div>
            <div className={`${MONO} text-[12px] text-white/75`}>
              {nodeCount} total
              <span className={`${MONO} block text-[10px] text-white/35 mt-0.5`}>
                1 control · {c.workers?.length || 0} worker{(c.workers?.length || 0) === 1 ? "" : "s"}
              </span>
            </div>
            <div className={`${MONO} text-[12px] text-white/75`}>{c.k8s_version || "—"}</div>
            <div className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              <span className="text-[12px] text-white/85">{s.label}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                onClick={() => c.cluster_id && downloadKubeconfig(c.cluster_id)}
                className={`${MONO} inline-flex items-center gap-1.5 h-8 px-2.5 border border-white/[0.08] bg-[#0d0e11] text-[10.5px] uppercase tracking-[0.12em] text-white/65 hover:text-white hover:bg-white/[0.04] transition-colors rounded-[4px]`}
              >
                <Download className="h-3 w-3" />
                kubeconfig
              </button>
              <Link
                href={{
                  pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(c.cluster_id || "")}`,
                  query: { clusterStatus: c.status },
                }}
                className={`${MONO} inline-flex items-center gap-1.5 h-8 px-2.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold transition-all rounded-[4px]`}
                style={{ background: ACCENT, color: "#001930" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_BRIGHT; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
              >
                <Activity className="h-3 w-3" />
                View
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ColHead({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </span>
  );
}

// ─── Empty state ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-12 text-center overflow-hidden">
      {/* Soft radial wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%), radial-gradient(circle at 70% 80%, rgba(167,139,250,0.025), transparent 50%)",
        }}
      />

      {/* Cluster-node visual */}
      <div className="relative mx-auto mb-5 h-24 w-24 flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-[10px]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
            WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 75%)",
            maskImage: "radial-gradient(circle, black 30%, transparent 75%)",
          }}
        />
        <div
          className="relative z-10 h-12 w-12 flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
          style={{ color: ACCENT }}
        >
          <Boxes className="h-5 w-5" />
        </div>
        {/* Pulsing nodes */}
        <span
          className="absolute top-3 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full"
          style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}`, animation: "kpulse 2s infinite" }}
        />
        <span
          className="absolute bottom-3 left-3 h-2 w-2 rounded-full"
          style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}`, animation: "kpulse 2s infinite 0.3s" }}
        />
        <span
          className="absolute bottom-3 right-3 h-2 w-2 rounded-full"
          style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}`, animation: "kpulse 2s infinite 0.6s" }}
        />
        <style>{`@keyframes kpulse { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.25); } }`}</style>
      </div>

      <h3 className="relative text-[18px] font-semibold tracking-[-0.015em] text-white">
        No clusters yet
      </h3>
      <p className={`${MONO} relative mt-2 max-w-md mx-auto text-[11.5px] text-white/45 leading-relaxed`}>
        Provision your first cluster with a managed control plane and autoscaling node pools — ready in about 4 minutes.
      </p>

      <div className="relative mt-5 inline-flex gap-2">
        <Link
          href="/dashboard/services/kubernetes/new"
          className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
            color: "#ffffff",
            boxShadow: "0 8px 20px rgba(0,149,255,0.20)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`; }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create cluster
        </Link>
        <button
          type="button"
          className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white hover:bg-white/[0.04] border border-white/[0.08] bg-transparent rounded-[5px] transition-colors`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Get kubeconfig
        </button>
      </div>
    </div>
  );
}
