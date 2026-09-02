"use client";
import { ServiceFeatureGrid } from "@/components/services/feature-grid";

// Kubernetes overview — editorial canvas with a large animated cluster
// mesh visualization in the hero corner, magazine-style horizontal
// stats strip (no boxes), feature illustration row with gently
// a text feature grid (see components/services/feature-grid), and a
// clean cluster inventory table.

import {
  Activity,
  ChevronRight,
  Download,
  Plus,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Tables } from "@/lib/supabase/types";

// ─── Design tokens ─────────────────────────────────────────────────
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

// ─── Static reference data ─────────────────────────────────────────

const FEATURES = [
  {
    title: "Fully managed control plane",
    desc: "We run etcd, the API server, and scheduler. You focus on workloads.",
  },
  {
    title: "Auto-scaling node pools",
    desc: "Pools scale up under load and back down idle — pay for what you use.",
  },
  {
    title: "Multi-region clusters",
    desc: "Spread node pools across regions for low-latency global delivery.",
  },
  {
    title: "Built-in load balancing",
    desc: "Layer-4 and layer-7 LBs are first-class objects in the cluster.",
  },
  {
    title: "GitOps-ready",
    desc: "Native ArgoCD and Flux compatibility — declarative deploys out of the box.",
  },
  {
    title: "99.99% uptime",
    desc: "HA control planes with three replicas, automatic failover, and rolling upgrades.",
  },
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

function statusMeta(status?: string | null): {
  dot: string;
  color: string;
  label: string;
  pulse?: boolean;
} {
  const v = (status || "unknown").toLowerCase();
  if (v === "ready")
    return { dot: "#4ade80", color: "#4ade80", label: "Ready", pulse: true };
  if (v === "pending" || v === "creating")
    return { dot: "#fbbf24", color: "#fbbf24", label: v === "creating" ? "Creating" : "Pending", pulse: true };
  if (v === "failed")
    return { dot: "#f87171", color: "#f87171", label: "Failed" };
  return {
    dot: "rgba(255,255,255,0.3)",
    color: "rgba(255,255,255,0.55)",
    label: v.charAt(0).toUpperCase() + v.slice(1),
  };
}

// ─── Component ─────────────────────────────────────────────────────

const KubernetesClustersMain = ({ clusters }: KubernetesClustersProps) => {
  const ready = clusters.filter((c) => c.status === "ready").length;
  const activeNodes = clusters.reduce(
    (sum, c) => sum + (c.workers?.length || 0) + 1,
    0,
  );
  const versions = new Set(clusters.map((c) => c.k8s_version).filter(Boolean)).size;

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[900px] w-[900px] blur-[60px]"
          style={{
            background: "radial-gradient(circle, rgba(0,149,255,0.08), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background: "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
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
        {/* ── Hero ─────────────────────────────────────────── */}
        <header className="mb-14">
          <div className="max-w-2xl">
            <h1 className="text-[40px] sm:text-[52px] leading-[1.02] tracking-[-0.03em] text-white font-semibold">
              Managed clusters{" "}
              <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
                for platform workloads
              </span>
            </h1>
            <div className="mt-6 flex items-center gap-2">
              <Link
                href="/dashboard/services/kubernetes/new"
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
                New cluster
              </Link>
            </div>
          </div>
        </header>

        {/* ── Stats — horizontal divider strip (no boxes) ──── */}
        <section className="mb-16 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
          <StatCell
            label="Total clusters"
            value={String(clusters.length)}
            hint="Provisioned environments"
          />
          <StatCell
            label="Healthy"
            value={`${ready}`}
            suffix={clusters.length > 0 ? `/ ${clusters.length}` : undefined}
            hint="Ready to accept workloads"
            accent="#4ade80"
          />
          <StatCell
            label="Active nodes"
            value={String(activeNodes)}
            hint="Control plane + workers"
            accent={ACCENT}
          />
          <StatCell
            label="Versions in use"
            value={versions > 0 ? String(versions) : "—"}
            hint="K8s channels across clusters"
          />
        </section>

        {/* ── Cluster inventory (front and centre) ─────────── */}
        <div id="inventory" className="mb-16">
          <SectionHead
            title="Your"
            accent="clusters"
            rightMeta={
              clusters.length > 0
                ? `${ready} healthy · ${clusters.length} total`
                : undefined
            }
          />
          {clusters.length > 0 ? (
            <ClusterTable clusters={clusters} />
          ) : (
            <EmptyState />
          )}
        </div>

        {/* ── Platform features ─────────────────────────────── */}
        <SectionHead
          title="Engineered"
          accent="for production"
          link={{
            label: "Read the docs",
            href: "#",
          }}
        />
        <ServiceFeatureGrid
          features={FEATURES}
          illustration="/images/kubernetes-ui/life cycle.png"
          className="mb-16"
        />


      </div>
    </div>
  );
};

export default KubernetesClustersMain;

// ─── Subcomponents ─────────────────────────────────────────────────

function SectionHead({
  title,
  accent,
  link,
  rightMeta,
}: {
  title: string;
  accent: string;
  link?: { label: string; href: string };
  rightMeta?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          {title} {accent}
        </h2>
      </div>
      <div className="flex items-center gap-4">
        {rightMeta && (
          <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 tabular-nums`}>
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

// ─── Cluster table ─────────────────────────────────────────────────

function ClusterTable({ clusters }: { clusters: ClusterData[] }) {
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
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
              <div className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                {c.cluster_name}
              </div>
              <div
                className={`${MONO} mt-0.5 text-[10px] text-white/30 truncate uppercase tracking-[0.04em]`}
              >
                {c.cluster_id}
              </div>
            </div>
            <div className={`${MONO} text-[11.5px] text-white/75 tabular-nums`}>
              {nodeCount} total
              <span className={`${MONO} block text-[10px] text-white/35 mt-0.5`}>
                1 control · {c.workers?.length || 0} worker
                {(c.workers?.length || 0) === 1 ? "" : "s"}
              </span>
            </div>
            <div className={`${MONO} text-[11.5px] text-white/75`}>
              {c.k8s_version || "—"}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.pulse ? "animate-pulse" : ""}`}
                style={{
                  background: s.dot,
                  boxShadow:
                    s.color === "rgba(255,255,255,0.55)"
                      ? "none"
                      : `0 0 5px ${s.color}`,
                }}
              />
              <span
                className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                style={{ color: s.color }}
              >
                {s.label}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                onClick={() => c.cluster_id && downloadKubeconfig(c.cluster_id)}
                className={`${MONO} inline-flex items-center gap-1.5 h-7 px-2.5 border border-white/[0.08] bg-[#0d0e11] text-[10px] uppercase tracking-[0.12em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[4px] transition-colors`}
              >
                <Download className="h-3 w-3" />
                kubeconfig
              </button>
              <Link
                href={{
                  pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(c.cluster_id || "")}`,
                  query: { clusterStatus: c.status },
                }}
                className={`${MONO} inline-flex items-center gap-1.5 h-7 px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-all`}
                style={{ background: ACCENT, color: "#ffffff" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = ACCENT_BRIGHT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = ACCENT;
                }}
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
      className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
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
    <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-14 text-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(0,149,255,0.05), transparent 50%), radial-gradient(circle at 70% 80%, rgba(167,139,250,0.03), transparent 50%)",
        }}
      />
      <h3 className="relative text-[20px] font-semibold tracking-[-0.015em] text-white">
        No clusters yet
      </h3>
      <p
        className={`${MONO} relative mt-2 max-w-md mx-auto text-[11.5px] text-white/45 leading-relaxed`}
      >
        Provision your first cluster with a managed control plane and
        autoscaling node pools — ready in about 4 minutes.
      </p>
      <div className="relative mt-6 inline-flex gap-2">
        <Link
          href="/dashboard/services/kubernetes/new"
          className={`${MONO} inline-flex items-center gap-2 h-10 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
            color: "#ffffff",
            boxShadow: "0 8px 20px rgba(0,149,255,0.20)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create cluster
        </Link>
        <button
          type="button"
          className={`${MONO} inline-flex items-center gap-2 h-10 px-4 text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white hover:bg-white/[0.04] border border-white/[0.08] bg-transparent rounded-[5px] transition-colors`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Get kubeconfig
        </button>
      </div>
    </div>
  );
}
