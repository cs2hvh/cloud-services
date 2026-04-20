"use client";

import { motion } from "motion/react";
import {
  Activity,
  Download,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";

import { Tables } from "@/lib/supabase/types";

type ClusterData = Tables<"clusters_get">;

interface KubernetesClustersProps {
  clusters: ClusterData[];
}

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
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-white/45">{meta}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center">
          <Image src={iconSrc} alt={label} width={44} height={44} className="h-11 w-11 object-contain" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const value = (status || "unknown").toLowerCase();

  const className =
    value === "ready"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : value === "pending" || value === "creating"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : value === "failed"
          ? "border-red-500/20 bg-red-500/10 text-red-300"
          : "border-white/10 bg-white/[0.05] text-white/60";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}

const downloadKubeconfig = async (clusterId: string) => {
  try {
    const res = await fetch("/api/services/kubernetes/clusters/downloadkube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cluster_id: clusterId }),
    });

    if (!res.ok) {
      throw new Error();
    }

    const data = await res.json();
    const yamlContent = data.data;
    const blob = new Blob([yamlContent], { type: "application/x-yaml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${clusterId}.yaml`;
    anchor.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error("Failed to download kubeconfig.");
  }
};

const KubernetesClustersMain = ({ clusters }: KubernetesClustersProps) => {
  const readyClusters = clusters.filter((cluster) => cluster.status === "ready").length;
  const activeNodes = clusters.reduce(
    (sum, cluster) => sum + (cluster.workers?.length || 0) + 1,
    0,
  );
  const pendingClusters = clusters.filter((cluster) =>
    ["pending", "creating"].includes(cluster.status || ""),
  ).length;
  const versions = new Set(clusters.map((cluster) => cluster.k8s_version).filter(Boolean)).size;

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
            Kubernetes Service
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Managed clusters for platform workloads.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Provision, monitor, and operate Kubernetes clusters with clearer node visibility,
            version tracking, and direct cluster access actions.
          </p>
        </div>

        <Link
          href="/dashboard/services/kubernetes/new"
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
          meta="Provisioned Kubernetes environments"
          iconSrc="/dashboard icons/total clusters .png"
        />
        <MetricCard
          label="Healthy"
          value={readyClusters}
          meta="Clusters ready to accept workloads"
          iconSrc="/dashboard icons/healthy .png"
        />
        <MetricCard
          label="Active Nodes"
          value={activeNodes}
          meta="Control plane and worker nodes combined"
          iconSrc="/dashboard icons/active nodes .png"
        />
        <MetricCard
          label="Pending"
          value={pendingClusters}
          meta={`${versions || 0} Kubernetes version${versions === 1 ? "" : "s"} in use`}
          iconSrc="/dashboard icons/pending .png"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.28 }}
        className="glass-panel overflow-hidden"
      >
        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Cluster Inventory
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Cluster status, access, and version posture.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                Review node counts, Kubernetes versions, and direct cluster actions from a single
                operator view.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/45">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                {clusters.length} total
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                Download kubeconfig inline
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {clusters.length > 0 ? (
            <div className="overflow-hidden border border-white/[0.08] bg-white/[0.02]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/[0.08]">
                  <thead className="bg-white/[0.04]">
                    <tr>
                      <Th>Cluster</Th>
                      <Th>Nodes</Th>
                      <Th>Version</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {clusters.map((cluster) => (
                      <tr key={cluster.cluster_id} className="transition-colors hover:bg-white/[0.04]">
                        <Td>
                          <div className="font-medium text-white">{cluster.cluster_name}</div>
                          <div className="mt-1 font-mono text-xs text-white/35">{cluster.cluster_id}</div>
                        </Td>
                        <Td>
                          <div className="text-sm text-white/80">{(cluster.workers?.length || 0) + 1}</div>
                          <div className="mt-1 text-xs text-white/35">
                            1 control plane / {cluster.workers?.length || 0} worker{(cluster.workers?.length || 0) === 1 ? "" : "s"}
                          </div>
                        </Td>
                        <Td>
                          <span className="text-sm text-white/72">{cluster.k8s_version || "N/A"}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={cluster.status} />
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (cluster.cluster_id) downloadKubeconfig(cluster.cluster_id);
                              }}
                              className="inline-flex items-center gap-2 border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-sm font-medium text-white/78 transition-colors hover:bg-white/[0.07]"
                            >
                              <Download className="h-4 w-4" />
                              kubeconfig
                            </button>
                            <Link
                              href={{
                                pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(cluster.cluster_id || "")}`,
                                query: { clusterStatus: cluster.status },
                              }}
                              className="inline-flex items-center gap-2 border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-500/15"
                            >
                              <Activity className="h-4 w-4" />
                              View cluster
                            </Link>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center border border-dashed border-white/[0.12] px-6 py-16 text-center">
              <Image src="/dashboard icons/total clusters .png" alt="No clusters" width={40} height={40} className="mb-4 h-10 w-10 object-contain opacity-20" />
              <h3 className="text-base font-semibold text-white">No Kubernetes clusters found</h3>
              <p className="mt-2 max-w-md text-sm text-white/45">
                Provision your first cluster to start managing control plane and worker capacity here.
              </p>
              <Link
                href="/dashboard/services/kubernetes/new"
                className="mt-5 inline-flex items-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Create cluster
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-6 py-4 align-middle text-sm text-white/75">{children}</td>;
}

export default KubernetesClustersMain;
