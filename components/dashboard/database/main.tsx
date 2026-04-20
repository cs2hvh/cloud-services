"use client";

import { motion } from "motion/react";
import {
  ArrowUpRight,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/app/dashboard/provider";
import { DatabaseIcon } from "@/components/dashboard/database/database-icon";
import { serviceLocations, vmLocations } from "@/config/locations";
import api from "@/lib/axios/axios";

type DbCluster = {
  id: string;
  name: string;
  engine: string;
  status: string;
  num_nodes: number;
  created_at: string;
  version: string;
  cluster_id: string;
  region: string;
};

const getLocationName = (regionCode: string): string => {
  const allLocations = [...serviceLocations, ...vmLocations];
  const location = allLocations.find(
    (loc) => loc.short.toLowerCase() === regionCode.toLowerCase(),
  );

  return location ? location.city : regionCode || "Unknown";
};

const formatStatus = (status: string): string => {
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatCreatedAt = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatRelativeTime = (dateString: string): string => {
  const createdAt = new Date(dateString);
  const seconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;

  return formatCreatedAt(dateString);
};

const getStatusClasses = (status: string): string => {
  switch (status) {
    case "online":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "creating":
    case "migrating":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "failed":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border-white/10 bg-white/[0.06] text-white/60";
  }
};

function MetricCard({
  label,
  value,
  meta,
  iconSrc,
}: {
  label: string;
  value: string | number;
  meta: string;
  iconSrc: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
            {value}
          </p>
          <p className="mt-1 text-sm text-white/45">{meta}</p>
        </div>
        <div className="flex-shrink-0">
          <Image src={iconSrc} alt={label} width={56} height={56} className="object-contain" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(status)}`}
    >
      {formatStatus(status)}
    </span>
  );
}

const DatabasePage = () => {
  const { user } = useSession();
  const router = useRouter();
  const [clusters, setClusters] = useState<DbCluster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user === null) {
      router.push("/login");
      toast.error("You must be logged in to access the dashboard.");
    }
  }, [router, user]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchClusters() {
      try {
        setLoading(true);
        const res = await api.post("/services/database/read_all_owner", {
          id: user?.id,
        });

        if (!mounted) return;

        if (res.status === 200) {
          setClusters(Array.isArray(res?.data?.data) ? res?.data?.data : []);
        }
      } catch (error) {
        console.error("Error fetching database clusters:", error);
        if (mounted) {
          toast.error("Failed to load database clusters.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchClusters();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const sortedClusters = useMemo(
    () =>
      [...clusters].sort(
        (first, second) =>
          new Date(second.created_at).getTime() -
          new Date(first.created_at).getTime(),
      ),
    [clusters],
  );

  const onlineClusters = clusters.filter((cluster) => cluster.status === "online").length;
  const provisioningClusters = clusters.filter((cluster) =>
    ["creating", "migrating", "restoring", "updating"].includes(cluster.status),
  ).length;
  const uniqueRegions = new Set(clusters.map((cluster) => cluster.region)).size;
  const totalNodes = clusters.reduce(
    (sum, cluster) => sum + Math.max(cluster.num_nodes || 0, 1),
    0,
  );

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16 text-white">
        <div className="glass-panel w-full max-w-md p-10 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-white/70" />
          <h2 className="mt-4 text-lg font-semibold text-white">Loading database services</h2>
          <p className="mt-2 text-sm text-white/45">
            Fetching cluster inventory and current status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
            Database Services
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Managed databases for production workloads.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Provision, monitor, and operate managed database clusters with clear lifecycle
            visibility, predictable capacity, and fast access to each environment.
          </p>
        </div>

        <Link
          href="/dashboard/services/database/new"
          className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          New Cluster
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.28 }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Total Clusters"
          value={clusters.length}
          meta="Managed database environments"
          iconSrc="/dashboard icons/total clusters .png"
        />
        <MetricCard
          label="Healthy"
          value={onlineClusters}
          meta="Currently online and serving"
          iconSrc="/dashboard icons/healthy .png"
        />
        <MetricCard
          label="Provisioning"
          value={provisioningClusters}
          meta="In progress or updating"
          iconSrc="/dashboard icons/provisioning.png"
        />
        <MetricCard
          label="Footprint"
          value={uniqueRegions > 0 ? `${uniqueRegions} regions` : totalNodes}
          meta={
            uniqueRegions > 0
              ? `${totalNodes} total node${totalNodes === 1 ? "" : "s"}`
              : "No deployed capacity yet"
          }
          iconSrc="/dashboard icons/foot print.png"
        />
      </motion.div>

      {sortedClusters.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.28 }}
          className="glass-panel overflow-hidden"
        >
          <div className="h-px w-full bg-gradient-to-r from-blue-400/45 via-blue-300/10 to-transparent" />
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white/92">Cluster Inventory</h2>
              <p className="mt-1 text-sm text-white/45">
                Review cluster health, capacity, versioning, and regional placement.
              </p>
            </div>
            <div className="text-sm text-white/45">
              {sortedClusters.length} active record{sortedClusters.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/[0.06]">
              <thead>
                <tr className="text-left">
                  <Th>Cluster</Th>
                  <Th>Region</Th>
                  <Th>Capacity</Th>
                  <Th>Created</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {sortedClusters.map((cluster) => (
                  <tr key={cluster.id} className="transition-colors hover:bg-white/[0.025]">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center border border-white/[0.08] bg-white/[0.05]">
                          <DatabaseIcon engine={cluster.engine} className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {cluster.name}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-white/45">
                            <span className="capitalize">{cluster.engine}</span>
                            <span className="text-white/20">•</span>
                            <span className="truncate">{cluster.cluster_id}</span>
                          </div>
                        </div>
                      </div>
                    </Td>

                    <Td>
                      <div className="flex items-center gap-2 text-sm text-white/72">
                        <MapPin className="h-3.5 w-3.5 text-white/35" />
                        <div>
                          <div>{getLocationName(cluster.region)}</div>
                          <div className="mt-0.5 text-xs uppercase tracking-wide text-white/35">
                            {cluster.region}
                          </div>
                        </div>
                      </div>
                    </Td>

                    <Td>
                      <div className="text-sm text-white/72">
                        <div>v{cluster.version}</div>
                        <div className="mt-0.5 text-xs text-white/35">
                          {cluster.num_nodes || 1} node{cluster.num_nodes === 1 ? "" : "s"}
                        </div>
                      </div>
                    </Td>

                    <Td>
                      <div className="text-sm text-white/72">
                        <div>{formatRelativeTime(cluster.created_at)}</div>
                        <div className="mt-0.5 text-xs text-white/35">
                          {formatCreatedAt(cluster.created_at)}
                        </div>
                      </div>
                    </Td>

                    <Td>
                      <StatusBadge status={cluster.status} />
                    </Td>

                    <Td className="text-right">
                      <Link
                        href={{
                          pathname: `/dashboard/services/database/clusters/${encodeURIComponent(cluster.cluster_id)}`,
                          query: { clusterStatus: cluster.status },
                        }}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-white/62 transition-colors hover:text-white"
                      >
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.28 }}
          className="glass-panel px-6 py-16 text-center sm:px-10"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <Image src="/dashboard icons/total clusters .png" alt="Database" width={48} height={48} className="object-contain" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-white">No database clusters yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/45">
            Create your first managed cluster to start provisioning databases with structured
            networking, user management, and operational controls.
          </p>
          <div className="mt-8">
            <Link
              href="/dashboard/services/database/new"
              className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Create Database Cluster
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/34 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-5 py-4 align-middle ${className}`}>{children}</td>;
}

export default DatabasePage;
