'use client';

import { motion } from "motion/react";
import {
  Database,
  MoreVertical,
  Plus,
  Archive,
  Shield,
  Box,
  Rocket,
  Cpu,
  Zap,
  ArrowUpRight,
  Clock,
  Globe,
  Server,
  GitBranch,
  Terminal,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ObjectSpaceBucket, Tables, PlatformApp } from "@/lib/supabase/types";
import { dbLocations } from "@/config/locations";
import { useSession } from "@/app/dashboard/provider";

interface PageProps {
  game_servers: Tables<"game_servers">[];
  database_clusters: Tables<"database_clusters">[];
  kubernetes_clusters: Tables<"clusters_get">[];
  spectrum_apps: Tables<"spectrum_apps">[];
  object_storage: ObjectSpaceBucket[];
  platform_apps: PlatformApp[];
  project_logs: Tables<"project_logs">[];
}

/* ─── Stat metric ─── */
const Stat = ({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
}) => (
  <Link href={href} className="group flex items-center gap-3 py-3.5 px-5 hover:bg-white/[0.04] transition-colors border-r border-white/[0.06] last:border-r-0 flex-1 min-w-0">
    <Icon className="w-4 h-4 text-white/50 flex-shrink-0" />
    <div className="min-w-0">
      <span className="text-xl font-bold text-white tabular-nums">{value}</span>
      <p className="text-[11px] text-white/50 truncate">{label}</p>
    </div>
  </Link>
);

const Dashboard = ({ data }: { data: PageProps }) => {
  const { user } = useSession();

  const activeSpectrum = data.spectrum_apps.filter(
    (app) => app.status === "updated" || app.status === "created"
  ).length;
  const activeStorage = data.object_storage.filter(
    (o) => o.status === "active"
  ).length;

  const totalResources =
    data.game_servers.length +
    data.database_clusters.length +
    data.kubernetes_clusters.length +
    activeSpectrum +
    activeStorage +
    data.platform_apps.length;

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
    user?.display_name || user?.username || user?.email?.split("@")[0] || "there";

  const hasAnyResources = totalResources > 0;

  return (
    <div className="flex-1 min-h-screen p-5 sm:p-8 text-white">

      {/* ─── Welcome bar ─── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-white/95">
            Welcome back, {userName}
          </h1>
          <p className="text-[13px] text-white/45 mt-0.5">Here&apos;s your infrastructure overview.</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-semibold text-white bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </Link>
      </motion.div>

      {/* ─── Stats strip ─── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        className="glass-panel flex overflow-x-auto mb-6"
      >
        <Stat label="Servers" value={data.game_servers.length} icon={Server} href="/dashboard/services/game" />
        <Stat label="Databases" value={data.database_clusters.length} icon={Database} href="/dashboard/services/database" />
        <Stat label="K8s Clusters" value={data.kubernetes_clusters.length} icon={Box} href="/dashboard/services/kubernetes" />
        <Stat label="DDoS Protection" value={activeSpectrum} icon={Shield} href="/dashboard/services/network-ddos" />
        <Stat label="Storage Buckets" value={activeStorage} icon={Archive} href="/dashboard/services/object-storage" />
        <Stat label="Apps Deployed" value={data.platform_apps.length} icon={Rocket} href="/dashboard/services/apps" />
      </motion.div>

      {/* ─── Feature spotlight cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3 }}
        >
          <Link
            href="/dashboard/services/apps/new"
            className="group block glass-card p-5 h-full transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="w-4 h-4 text-white/60" />
              <span className="text-[10px] font-semibold text-white/45 uppercase tracking-widest">App Platform</span>
            </div>
            <h3 className="text-[15px] font-semibold text-white/95 mb-1.5">Deploy from Git</h3>
            <p className="text-[12px] text-white/50 leading-relaxed mb-4">
              Push to deploy. Connect GitHub, GitLab, or Bitbucket and ship with zero config.
            </p>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-white/50 group-hover:text-white/80 transition-colors">
              Get started <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3 }}
        >
          <Link
            href="/dashboard/services/ai-agents"
            className="group block glass-card p-5 h-full transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-white/60" />
              <span className="text-[10px] font-semibold text-white/45 uppercase tracking-widest">AI Agents</span>
            </div>
            <h3 className="text-[15px] font-semibold text-white/95 mb-1.5">Build with AI</h3>
            <p className="text-[12px] text-white/50 leading-relaxed mb-4">
              Deploy autonomous agents backed by managed inference. Prototype to production.
            </p>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-white/50 group-hover:text-white/80 transition-colors">
              Explore agents <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3 }}
        >
          <Link
            href="/dashboard/services/compute/bare-metal"
            className="group block glass-card p-5 h-full transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-white/60" />
              <span className="text-[10px] font-semibold text-white/45 uppercase tracking-widest">GPU Compute</span>
            </div>
            <h3 className="text-[15px] font-semibold text-white/95 mb-1.5">GPU Instances</h3>
            <p className="text-[12px] text-white/50 leading-relaxed mb-4">
              H100, A100, and L40S on demand. No long-term commitments. Pay by the hour.
            </p>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-white/50 group-hover:text-white/80 transition-colors">
              View GPUs <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Link
            href="/dashboard/domains/marketplace"
            className="group block glass-card p-5 h-full transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-white/60" />
              <span className="text-[10px] font-semibold text-white/45 uppercase tracking-widest">Domains</span>
            </div>
            <h3 className="text-[15px] font-semibold text-white/95 mb-1.5">Domain Marketplace</h3>
            <p className="text-[12px] text-white/50 leading-relaxed mb-4">
              Search availability, submit managed purchase requests, and connect domains to your apps.
            </p>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-white/50 group-hover:text-white/80 transition-colors">
              Open marketplace <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </motion.div>
      </div>

      {/* ─── Main content: Resources + Activity side by side ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">

        {/* Left: Resources overview (3 col) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="lg:col-span-3 glass-panel overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <h2 className="text-[13px] font-bold text-white/80 uppercase tracking-wider">Resources</h2>
            <span className="text-[12px] text-white/40 tabular-nums font-medium">{totalResources} total</span>
          </div>

          {hasAnyResources ? (
            <div className="divide-y divide-white/[0.05]">
              {/* Game Servers inline */}
              {data.game_servers.map((server) => (
                <div key={`gs-${server.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
                  <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] border border-white/[0.10] flex-shrink-0">
                    <Cpu className="w-4 h-4 text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/90 truncate">{server.name}</p>
                    <p className="text-[11px] text-white/40">{server.game_type}</p>
                  </div>
                  <StatusBadge status={server.status} activeStatuses={["active"]} />
                  <button className="p-1 text-white/25 hover:text-white/60 transition-colors">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Database Clusters inline */}
              {data.database_clusters.map((db) => (
                <Link
                  key={`db-${db.id}`}
                  href={`/dashboard/services/database/clusters/${db.cluster_id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] border border-white/[0.10] flex-shrink-0">
                    <Database className="w-4 h-4 text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/90 truncate">{db.name}</p>
                    <p className="text-[11px] text-white/40">
                      {dbLocations.find((l) => l.short === db.region)?.city || db.region} · v{db.version}
                    </p>
                  </div>
                  <StatusBadge status={db.status} activeStatuses={["online"]} />
                </Link>
              ))}

              {/* Kubernetes Clusters inline */}
              {data.kubernetes_clusters.map((k8s) => (
                <div key={`k8s-${k8s.cluster_id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
                  <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] border border-white/[0.10] flex-shrink-0">
                    <Box className="w-4 h-4 text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/90 truncate">{k8s.cluster_name}</p>
                    <p className="text-[11px] text-white/40">
                      {k8s.cni_plugin} · {k8s.k8s_version} · {k8s.workers?.length} nodes
                    </p>
                  </div>
                  <StatusBadge status={k8s.status ?? null} activeStatuses={["ready"]} />
                </div>
              ))}

              {/* Spectrum Apps inline */}
              {data.spectrum_apps.map((app) => (
                <Link
                  key={`sp-${app.id}`}
                  href={`/dashboard/services/network-ddos/${app.spectrum_id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] border border-white/[0.10] flex-shrink-0">
                    <Shield className="w-4 h-4 text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/90 truncate">{app.dns.original_name}</p>
                    <p className="text-[11px] text-white/40">{app.protocol} · {app.traffic_type || "direct"}</p>
                  </div>
                  <StatusBadge status={app.status} activeStatuses={["updated", "created"]} />
                </Link>
              ))}

              {/* Object Storage inline */}
              {data.object_storage.map((bucket) => (
                <Link
                  key={`os-${bucket.id}`}
                  href={`/dashboard/services/object-storage/${bucket.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] border border-white/[0.10] flex-shrink-0">
                    <Archive className="w-4 h-4 text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/90 truncate">{bucket.name}</p>
                    <p className="text-[11px] text-white/40">{bucket.id}</p>
                  </div>
                  <StatusBadge status={bucket.status} activeStatuses={["active"]} />
                </Link>
              ))}

              {/* Platform Apps inline */}
              {data.platform_apps.map((app) => (
                <Link
                  key={`pa-${app.id}`}
                  href={`/dashboard/services/apps/${app.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-8 h-8 flex items-center justify-center bg-white/[0.07] border border-white/[0.10] flex-shrink-0">
                    <Rocket className="w-4 h-4 text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/90 truncate">{app.name}</p>
                    <p className="text-[11px] text-white/40">
                      {app.repository_name} · {app.git_provider || "github"}
                    </p>
                  </div>
                  <StatusBadge status={app.status} activeStatuses={["running"]} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Terminal className="mx-auto h-8 w-8 text-white/15 mb-3" />
              <h3 className="text-[14px] font-medium text-white/60 mb-1">No resources yet</h3>
              <p className="text-[12px] text-white/35 mb-5 max-w-xs mx-auto">
                Deploy your first server, database, or application to get started.
              </p>
              <Link
                href="/dashboard/services/compute/vps"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-[12px] font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] border border-white/[0.10] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Resource
              </Link>
            </div>
          )}
        </motion.div>

        {/* Right column: Activity + Quick actions (2 col) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Activity feed */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="glass-panel overflow-hidden flex-1"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
              <h2 className="text-[13px] font-bold text-white/80 uppercase tracking-wider">Activity</h2>
              <Link
                href="/dashboard/activity"
                className="text-[12px] text-white/50 hover:text-white/80 font-medium transition-colors"
              >
                View all
              </Link>
            </div>
            <div className="px-5 py-1">
              {data.project_logs?.slice(0, 8).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-b-0"
                >
                  <div className="w-5 h-5 flex items-center justify-center bg-white/[0.07] flex-shrink-0 mt-0.5">
                    <Clock className="w-2.5 h-2.5 text-white/45" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-white/75 leading-snug font-medium">{activity.event}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-white/35 truncate">{activity.text}</p>
                      <span className="text-[10px] text-white/30 flex-shrink-0">
                        {formatTimeAgo(new Date(activity?.created_at || ""))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {(!data.project_logs || data.project_logs.length === 0) && (
                <p className="text-[13px] text-white/30 py-8 text-center">
                  No recent activity
                </p>
              )}
            </div>
          </motion.div>

          {/* Quick links */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="grid grid-cols-2 gap-px bg-white/[0.06]"
          >
            {[
              { label: "Documentation", href: "/docs", icon: ArrowUpRight },
              { label: "Billing", href: "/dashboard/nav/billing", icon: ArrowUpRight },
              { label: "Settings", href: "/dashboard/settings", icon: ArrowUpRight },
              { label: "Support", href: "/support", icon: ArrowUpRight },
            ].map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="flex items-center justify-between px-4 py-3.5 bg-[#0a0a0c] hover:bg-white/[0.04] transition-colors text-[13px] font-medium text-white/55 hover:text-white/85"
              >
                {link.label}
                <link.icon className="w-3.5 h-3.5" />
              </Link>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ─── Bottom banner: Discover more ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.3 }}
        className="glass-panel overflow-hidden"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          <Link
            href="/dashboard/services/network-ddos"
            className="group flex items-center gap-4 p-5 hover:bg-white/[0.03] transition-colors"
          >
            <Shield className="w-8 h-8 text-white/20 flex-shrink-0 group-hover:text-white/45 transition-colors" />
            <div>
              <h3 className="text-[13px] font-semibold text-white/85 mb-0.5">DDoS Protection</h3>
              <p className="text-[11px] text-white/45">Enterprise L3/L4/L7 mitigation for any origin.</p>
            </div>
          </Link>
          <Link
            href="/dashboard/services/database"
            className="group flex items-center gap-4 p-5 hover:bg-white/[0.03] transition-colors"
          >
            <Database className="w-8 h-8 text-white/20 flex-shrink-0 group-hover:text-white/45 transition-colors" />
            <div>
              <h3 className="text-[13px] font-semibold text-white/85 mb-0.5">Managed Databases</h3>
              <p className="text-[11px] text-white/45">MySQL, PostgreSQL, Redis with daily backups.</p>
            </div>
          </Link>
          <Link
            href="/dashboard/services/kubernetes"
            className="group flex items-center gap-4 p-5 hover:bg-white/[0.03] transition-colors"
          >
            <Box className="w-8 h-8 text-white/20 flex-shrink-0 group-hover:text-white/45 transition-colors" />
            <div>
              <h3 className="text-[13px] font-semibold text-white/85 mb-0.5">Kubernetes</h3>
              <p className="text-[11px] text-white/45">Fully managed clusters. Auto-scaling built in.</p>
            </div>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

/* ─── Status Badge ─── */
const StatusBadge = ({
  status,
  activeStatuses,
}: {
  status: string | null;
  activeStatuses: string[];
}) => {
  const isActive = activeStatuses.includes(status || "");
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold flex-shrink-0 ${
        isActive
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
          : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
      }`}
    >
      <span className={`w-1.5 h-1.5 ${isActive ? "bg-emerald-400" : "bg-amber-400"}`} />
      {status}
    </span>
  );
};

export default Dashboard;
