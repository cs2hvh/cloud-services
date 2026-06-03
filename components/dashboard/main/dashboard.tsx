"use client";

// Dashboard home — editorial canvas, Nunito-accent welcome, horizontal
// resource stats strip, feature spotlight cards, resources + activity
// 2-col layout, and a discover banner. Matches the rest of the
// dashboard's design language.

import { ArrowUpRight, MoreVertical, Plus } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { SERVICE_ICONS } from "@/lib/services/service-icons";
import { ObjectSpaceBucket, PlatformApp, Tables } from "@/lib/supabase/types";
import { dbLocations } from "@/config/locations";
import { useSession } from "@/app/dashboard/provider";
import type { GpuPodSummary } from "@/lib/services/runpod-service";
import { NvidiaLogo } from "@/components/branding/nvidia-logo";

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";

// ─── Custom stroke glyphs (24×24) ──────────────────────────────────
// Premium hand-tuned glyphs in the editorial style — never lucide.

function ServerGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="3" y="4" width="18" height="6" rx="1.2" />
            <rect x="3" y="14" width="18" height="6" rx="1.2" />
            <circle cx="6" cy="7" r="0.7" fill="currentColor" />
            <circle cx="6" cy="17" r="0.7" fill="currentColor" />
            <line x1="9" y1="7" x2="18" y2="7" strokeOpacity="0.5" />
            <line x1="9" y1="17" x2="18" y2="17" strokeOpacity="0.5" />
        </svg>
    );
}

function GpuGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <rect x="2.5" y="7" width="17" height="10" rx="1.2" />
            <rect x="5.5" y="9.5" width="11" height="5" rx="0.6" fill="currentColor" fillOpacity="0.18" />
            <path d="M19.5 10h2M19.5 14h2M2.5 17l1.5 2M16 17l1.5 2" strokeLinecap="round" />
            <circle cx="7.5" cy="12" r="0.6" fill="currentColor" />
            <circle cx="14.5" cy="12" r="0.6" fill="currentColor" />
        </svg>
    );
}

function DatabaseGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <ellipse cx="12" cy="5.5" rx="7" ry="2.2" />
            <path d="M5 5.5v6c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2v-6" />
            <path d="M5 11.5v6c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2v-6" />
        </svg>
    );
}

function K8sGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M12 2.5l8 4v9.5l-8 5.5-8-5.5V6.5l8-4z" />
            <path d="M12 8v8M8 10l8 4M16 10l-8 4" strokeOpacity="0.55" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
    );
}

function ShieldGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round">
            <path d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3z" />
            <path d="M9.5 12.5l2 2 3.5-4" />
        </svg>
    );
}

function BucketGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M3.5 6.5h17l-1.5 13a2 2 0 01-2 1.8H7a2 2 0 01-2-1.8L3.5 6.5z" />
            <path d="M3 6.5l1.5-2.5h15L21 6.5" />
            <path d="M9.5 11l1 6M14.5 11l-1 6" strokeOpacity="0.5" />
        </svg>
    );
}

function AppGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
            <path d="M12 2.5l8 4v9l-8 5-8-5v-9l8-4z" />
            <path d="M4 6.5l8 4 8-4M12 10.5v10" strokeOpacity="0.55" />
            <circle cx="12" cy="2.5" r="1" fill="currentColor" />
        </svg>
    );
}

function GitFlowGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="2" />
            <circle cx="6" cy="18" r="2" />
            <circle cx="18" cy="12" r="2" />
            <path d="M6 8v8" />
            <path d="M6 11c0 3 2 5 5 5h5" />
        </svg>
    );
}

function GlobeGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4}>
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" strokeOpacity="0.55" />
            <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.55" />
        </svg>
    );
}

function PulseGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" strokeOpacity="0.35" />
            <path d="M4 12h3l2-5 3 10 2-5h6" />
        </svg>
    );
}

function ClockGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
        </svg>
    );
}

function EmptyStateGlyph() {
    return (
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round">
            <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
            <path d="M7 9.5l2 2-2 2M11 13.5h5" />
        </svg>
    );
}

interface PageProps {
    game_servers: Tables<"game_servers">[];
    database_clusters: Tables<"database_clusters">[];
    kubernetes_clusters: Tables<"clusters_get">[];
    spectrum_apps: Tables<"spectrum_apps">[];
    object_storage: ObjectSpaceBucket[];
    platform_apps: PlatformApp[];
    gpu_pods: GpuPodSummary[];
    project_logs: Tables<"project_logs">[];
}

const Dashboard = ({ data }: { data: PageProps }) => {
    const { user } = useSession();

    const activeSpectrum = data.spectrum_apps.filter(
        (app) => app.status === "updated" || app.status === "created",
    ).length;
    const activeStorage = data.object_storage.filter(
        (o) => o.status === "active",
    ).length;
    const totalGpus = data.gpu_pods.reduce(
        (sum, p) => sum + (p.gpuCount || 0),
        0,
    );

    const totalResources =
        data.game_servers.length +
        data.database_clusters.length +
        data.kubernetes_clusters.length +
        activeSpectrum +
        activeStorage +
        data.platform_apps.length +
        data.gpu_pods.length;

    const formatTimeAgo = (date: Date): string => {
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (seconds < 60) return "just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
        return date.toLocaleDateString();
    };

    const userName =
        user?.display_name ||
        user?.username ||
        user?.email?.split("@")[0] ||
        "there";

    const hasAnyResources = totalResources > 0;

    return (
        <div className="px-6 py-8 sm:px-10 sm:py-10">
            {/* Hero */}
            <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-12">
                <div className="max-w-2xl">
                    <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
                        Welcome back,{" "}
                        <span
                            style={SERIF_STYLE}
                            className="text-[#0095FF] font-normal"
                        >
                            {userName}
                        </span>
                    </h1>
                    <p
                        className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}
                    >
                        Here&apos;s your infrastructure overview across compute,
                        data, and protection.
                    </p>
                </div>
                <Link
                    href="/dashboard/projects/new"
                    className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all shrink-0`}
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
                    New project
                </Link>
            </header>

            {/* Stats strip */}
            <section className="mb-10 border-y border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-white/[0.06]">
                <StatLink
                    label="Servers"
                    value={data.game_servers.length}
                    glyph={<ServerGlyph />}
                    href="/dashboard/services/compute/vps"
                />
                <StatLink
                    label="GPU pods"
                    value={data.gpu_pods.length}
                    glyph={<GpuGlyph />}
                    href="/dashboard/services/gpu"
                    sub={totalGpus > 0 ? `${totalGpus} GPUs` : undefined}
                />
                <StatLink
                    label="Databases"
                    value={data.database_clusters.length}
                    glyph={<DatabaseGlyph />}
                    href="/dashboard/services/database"
                />
                <StatLink
                    label="K8s"
                    value={data.kubernetes_clusters.length}
                    glyph={<K8sGlyph />}
                    href="/dashboard/services/kubernetes"
                />
                <StatLink
                    label="DDoS"
                    value={activeSpectrum}
                    glyph={<ShieldGlyph />}
                    href="/dashboard/services/network-ddos"
                />
                <StatLink
                    label="Buckets"
                    value={activeStorage}
                    glyph={<BucketGlyph />}
                    href="/dashboard/services/object-storage"
                />
                <StatLink
                    label="Apps"
                    value={data.platform_apps.length}
                    glyph={<AppGlyph />}
                    href="/dashboard/services/apps"
                />
            </section>

            {/* Feature spotlight */}
            <SectionHead
                eyebrow="Get started"
                title="Spin up"
                accent="something new"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-12">
                <SpotlightCard
                    eyebrow="App Platform"
                    iconSrc={SERVICE_ICONS.appDeployment.src}
                    title="Deploy from Git"
                    desc="Push to deploy. Connect GitHub, GitLab, or Bitbucket and ship with zero config."
                    cta="Get started"
                    href="/dashboard/services/apps/new"
                />
                <SpotlightCard
                    eyebrow="GPU Cloud"
                    iconSrc={SERVICE_ICONS.gpu.src}
                    title="GPU instances"
                    desc="B200, H200, H100, and L40S on demand. Pay by the second."
                    cta="View GPUs"
                    href="/dashboard/services/gpu"
                />
                <SpotlightCard
                    eyebrow="Domains"
                    iconSrc={SERVICE_ICONS.domain.src}
                    title="Domain marketplace"
                    desc="Search availability, submit managed purchase requests, and connect to apps."
                    cta="Open marketplace"
                    href="/dashboard/domains/marketplace"
                />
            </div>

            {/* A.I. Labs — surface the AI platform on the overview */}
            <SectionHead eyebrow="A.I. Labs" title="Build with" accent="AI" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-12">
                <SpotlightCard
                    eyebrow="Inference"
                    iconSrc={SERVICE_ICONS.inference.src}
                    title="Inference gateway"
                    desc="OpenAI-compatible API across frontier and open models. One key, one bill."
                    cta="Open inference"
                    href="/dashboard/services/inference"
                />
                <SpotlightCard
                    eyebrow="Fine-Tuning"
                    iconSrc={SERVICE_ICONS.fineTuning.src}
                    title="Fine-tune a model"
                    desc="LoRA fine-tunes on managed GPUs. Bring a dataset, get a served model."
                    cta="Start a job"
                    href="/dashboard/services/inference/fine-tuning"
                />
                <SpotlightCard
                    eyebrow="Embeddings"
                    iconSrc={SERVICE_ICONS.embeddings.src}
                    title="Embeddings & vector"
                    desc="Managed vector collections with auto-embed and similarity search."
                    cta="Open vectors"
                    href="/dashboard/services/inference/vectors"
                />
                <SpotlightCard
                    eyebrow="Model Hosting"
                    iconSrc={SERVICE_ICONS.modelHosting.src}
                    title="Deploy your model"
                    desc="Bring your own container or HuggingFace model and serve it on a GPU."
                    cta="Deploy a model"
                    href="/dashboard/services/inference/deployments"
                />
            </div>

            {/* Resources + Activity 2-col */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-12">
                {/* Resources */}
                <section className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                    <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                        <h2
                            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/55`}
                        >
                            Resources
                        </h2>
                        <span
                            className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40 tabular-nums`}
                        >
                            {totalResources} total
                        </span>
                    </header>

                    {hasAnyResources ? (
                        <div>
                            {data.game_servers.map((server) => (
                                <ResourceRow
                                    key={`gs-${server.id}`}
                                    icon={<div className="h-3.5 w-3.5"><ServerGlyph /></div>}
                                    title={server.name}
                                    sub={server.game_type ?? "—"}
                                >
                                    <StatusPill
                                        status={server.status}
                                        activeStatuses={["active"]}
                                    />
                                    <button className="p-1 text-white/25 hover:text-white/60 transition-colors">
                                        <MoreVertical className="h-3.5 w-3.5" />
                                    </button>
                                </ResourceRow>
                            ))}
                            {data.gpu_pods.map((pod) => (
                                <ResourceRow
                                    key={`gpu-${pod.id}`}
                                    href={`/dashboard/services/gpu/${pod.id}`}
                                    icon={<div className="h-3.5 w-3.5"><GpuGlyph /></div>}
                                    title={pod.name}
                                    sub={
                                        <span className="inline-flex items-center gap-1.5 align-middle">
                                            <NvidiaLogo width={14} height={10} className="opacity-90" />
                                            <span>
                                                {pod.gpuCount}× {pod.gpuCatalogId} · ${pod.hourlyCostUsd.toFixed(2)}/hr
                                            </span>
                                        </span>
                                    }
                                >
                                    <StatusPill
                                        status={pod.status}
                                        activeStatuses={["running"]}
                                    />
                                </ResourceRow>
                            ))}
                            {data.database_clusters.map((db) => (
                                <ResourceRow
                                    key={`db-${db.id}`}
                                    href={`/dashboard/services/database/clusters/${db.cluster_id}`}
                                    icon={<div className="h-3.5 w-3.5"><DatabaseGlyph /></div>}
                                    title={db.name}
                                    sub={`${dbLocations.find((l) => l.short === db.region)?.city || db.region} · v${db.version}`}
                                >
                                    <StatusPill
                                        status={db.status}
                                        activeStatuses={["online"]}
                                    />
                                </ResourceRow>
                            ))}
                            {data.kubernetes_clusters.map((k8s) => (
                                <ResourceRow
                                    key={`k8s-${k8s.cluster_id}`}
                                    icon={<div className="h-3.5 w-3.5"><K8sGlyph /></div>}
                                    title={k8s.cluster_name}
                                    sub={`${k8s.cni_plugin} · ${k8s.k8s_version} · ${k8s.workers?.length} nodes`}
                                >
                                    <StatusPill
                                        status={k8s.status ?? null}
                                        activeStatuses={["ready"]}
                                    />
                                </ResourceRow>
                            ))}
                            {data.spectrum_apps.map((app) => (
                                <ResourceRow
                                    key={`sp-${app.id}`}
                                    href={`/dashboard/services/network-ddos/${app.spectrum_id}`}
                                    icon={<div className="h-3.5 w-3.5"><ShieldGlyph /></div>}
                                    title={app.dns?.original_name ?? "—"}
                                    sub={`${app.protocol} · ${app.traffic_type || "direct"}`}
                                >
                                    <StatusPill
                                        status={app.status}
                                        activeStatuses={[
                                            "updated",
                                            "created",
                                        ]}
                                    />
                                </ResourceRow>
                            ))}
                            {data.object_storage.map((bucket) => (
                                <ResourceRow
                                    key={`os-${bucket.id}`}
                                    href={`/dashboard/services/object-storage/${bucket.id}`}
                                    icon={<div className="h-3.5 w-3.5"><BucketGlyph /></div>}
                                    title={bucket.name}
                                    sub={bucket.id ?? "—"}
                                >
                                    <StatusPill
                                        status={bucket.status}
                                        activeStatuses={["active"]}
                                    />
                                </ResourceRow>
                            ))}
                            {data.platform_apps.map((app) => (
                                <ResourceRow
                                    key={`pa-${app.id}`}
                                    href={`/dashboard/services/apps/${app.id}`}
                                    icon={<div className="h-3.5 w-3.5"><AppGlyph /></div>}
                                    title={app.name}
                                    sub={`${app.repository_name} · ${app.git_provider || "github"}`}
                                >
                                    <StatusPill
                                        status={app.status}
                                        activeStatuses={["running"]}
                                    />
                                </ResourceRow>
                            ))}
                        </div>
                    ) : (
                        <div className="py-14 px-6 text-center">
                            <div
                                className="h-12 w-12 mb-4 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
                                style={{ color: ACCENT }}
                            >
                                <div className="h-5 w-5"><EmptyStateGlyph /></div>
                            </div>
                            <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-white">
                                No resources yet
                            </h3>
                            <p
                                className={`${MONO} mt-2 max-w-xs mx-auto text-[11px] text-white/45`}
                            >
                                Deploy your first server, database, or
                                application to get started.
                            </p>
                            <Link
                                href="/dashboard/services/compute/vps"
                                className={`${MONO} mt-5 inline-flex h-9 items-center gap-2 px-4 text-[10.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px]`}
                                style={{
                                    background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                                    color: "#ffffff",
                                    boxShadow:
                                        "0 8px 20px rgba(0,149,255,0.20)",
                                }}
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Create resource
                            </Link>
                        </div>
                    )}
                </section>

                {/* Activity feed */}
                <section className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden flex flex-col">
                    <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                        <h2
                            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/55`}
                        >
                            Recent activity
                        </h2>
                        <Link
                            href="/dashboard/activity"
                            className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-[#0095FF] transition-colors`}
                        >
                            View all →
                        </Link>
                    </header>
                    <div className="flex-1">
                        {data.project_logs?.slice(0, 8).map((activity) => (
                            <div
                                key={activity.id}
                                className="flex items-start gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0"
                            >
                                <div className="h-6 w-6 shrink-0 inline-flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] rounded-[4px] text-white/45 mt-0.5">
                                    <div className="h-3 w-3"><ClockGlyph /></div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12.5px] text-white/85 font-medium truncate">
                                        {activity.event}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p
                                            className={`${MONO} text-[10.5px] text-white/40 truncate`}
                                        >
                                            {activity.text}
                                        </p>
                                        <span
                                            className={`${MONO} text-[10px] text-white/30 shrink-0`}
                                        >
                                            {formatTimeAgo(
                                                new Date(
                                                    activity?.created_at || "",
                                                ),
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!data.project_logs ||
                            data.project_logs.length === 0) && (
                            <div className="py-12 text-center">
                                <p
                                    className={`${MONO} text-[11px] text-white/35`}
                                >
                                    No recent activity
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Discover banner */}
            <SectionHead
                eyebrow="Discover more"
                title="What else"
                accent="we offer"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DiscoverCard
                    href="/dashboard/services/network-ddos"
                    icon={<div className="h-4 w-4"><ShieldGlyph /></div>}
                    title="DDoS protection"
                    desc="Layer-4 mitigation at the Cloudflare edge."
                />
                <DiscoverCard
                    href="/dashboard/services/database"
                    icon={<div className="h-4 w-4"><DatabaseGlyph /></div>}
                    title="Managed databases"
                    desc="Postgres, MySQL, MongoDB with backups."
                />
                <DiscoverCard
                    href="/dashboard/services/kubernetes"
                    icon={<div className="h-4 w-4"><K8sGlyph /></div>}
                    title="Kubernetes"
                    desc="Fully managed clusters with autoscaling."
                />
            </div>
        </div>
    );
};

export default Dashboard;

// ─── Subcomponents ────────────────────────────────────────────────

function StatLink({
    label,
    value,
    glyph,
    href,
    sub,
}: {
    label: string;
    value: number;
    glyph: React.ReactNode;
    href: string;
    sub?: string;
}) {
    return (
        <Link
            href={href}
            className="px-5 py-5 flex flex-col gap-2 hover:bg-white/[0.015] transition-colors group"
        >
            <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 text-white/55 group-hover:text-[#0095FF] transition-colors">
                    {glyph}
                </div>
                <span
                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
                >
                    {label}
                </span>
            </div>
            <span
                style={SERIF_STYLE}
                className="text-[34px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
            >
                {value}
            </span>
            {sub && (
                <span className={`${MONO} text-[10px] text-white/40`}>
                    {sub}
                </span>
            )}
        </Link>
    );
}

function SectionHead({
    eyebrow,
    title,
    accent,
}: {
    eyebrow: string;
    title: string;
    accent: string;
}) {
    return (
        <div className="mb-5">
            <p
                className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5`}
            >
                {eyebrow}
            </p>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
                {title}{" "}
                <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                    {accent}
                </span>
            </h2>
        </div>
    );
}

function SpotlightCard({
    eyebrow,
    iconSrc,
    title,
    desc,
    cta,
    href,
}: {
    eyebrow: string;
    iconSrc: string;
    title: string;
    desc: string;
    cta: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="group border border-white/[0.06] bg-[#111216] hover:bg-[#16181d] hover:border-white/[0.14] rounded-[6px] p-5 transition-all flex flex-col gap-3"
        >
            <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2.5">
                    <Image
                        src={iconSrc}
                        alt=""
                        width={28}
                        height={28}
                        className="object-contain"
                    />
                    <span
                        className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold`}
                        style={{ color: ACCENT }}
                    >
                        {eyebrow}
                    </span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-white/25 group-hover:text-[#0095FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white mb-1.5">
                    {title}
                </h3>
                <p className="text-[12px] text-white/55 leading-snug">
                    {desc}
                </p>
            </div>
            <span
                className={`${MONO} mt-auto pt-2 border-t border-white/[0.05] text-[10px] uppercase tracking-[0.12em] font-semibold text-white/55 group-hover:text-[#0095FF] transition-colors`}
            >
                {cta} →
            </span>
        </Link>
    );
}

function ResourceRow({
    icon,
    title,
    sub,
    href,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    sub: React.ReactNode;
    href?: string;
    children: React.ReactNode;
}) {
    const inner = (
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors">
            <div className="h-7 w-7 shrink-0 inline-flex items-center justify-center border border-white/[0.06] bg-[#0d0e11] rounded-[5px] text-white/55">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium text-white/90 truncate">
                    {title}
                </p>
                <div className={`${MONO} text-[10.5px] text-white/40 truncate`}>
                    {sub}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">{children}</div>
        </div>
    );
    return href ? <Link href={href}>{inner}</Link> : inner;
}

function StatusPill({
    status,
    activeStatuses,
}: {
    status: string | null;
    activeStatuses: string[];
}) {
    const isActive = activeStatuses.includes(status || "");
    const color = isActive ? "#4ade80" : "#fbbf24";
    return (
        <span
            className={`${MONO} inline-flex items-center gap-1.5 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.12em] font-semibold border rounded-[3px]`}
            style={{
                color,
                borderColor: `${color}40`,
                background: `${color}10`,
            }}
        >
            <span
                className="h-1 w-1 rounded-full"
                style={{ background: color, boxShadow: `0 0 4px ${color}` }}
            />
            {status || "—"}
        </span>
    );
}

function DiscoverCard({
    icon,
    title,
    desc,
    href,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-4 border border-white/[0.06] bg-[#111216] hover:bg-[#16181d] hover:border-white/[0.14] rounded-[6px] p-5 transition-all"
        >
            <span
                className="h-10 w-10 shrink-0 inline-flex items-center justify-center border rounded-[6px] transition-colors"
                style={{
                    color: "rgba(255,255,255,0.45)",
                    background: "#0d0e11",
                    borderColor: "rgba(255,255,255,0.08)",
                }}
            >
                {icon}
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold text-white/90 mb-0.5">
                    {title}
                </h3>
                <p
                    className={`${MONO} text-[10.5px] text-white/45 leading-snug`}
                >
                    {desc}
                </p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/20 group-hover:text-[#0095FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </Link>
    );
}
