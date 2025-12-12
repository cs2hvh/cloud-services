"use client";

import { motion } from "motion/react";
import { DockIcon, Plus } from "lucide-react";
import Link from "next/link";
import { Tables } from "@/lib/supabase/types";

type ClusterData = Tables<"clusters_get">;

interface KubernetesClustersProps {
  clusters: ClusterData[];
}

const downloadKubeconfig = async (clusterId: string) => {
  try {
    const res = await fetch("/api/services/kubernetes/clusters/downloadkube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cluster_id: clusterId }),
    });

    if (res.ok) {
      const data = await res.json();
      const yamlContent = data.data;

      const blob = new Blob([yamlContent], { type: "application/x-yaml" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${clusterId}.yaml`;
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    // Silent error handling - could be replaced with toast notification
  }
};

const KubernetesClustersMain = ({ clusters }: KubernetesClustersProps) => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Kubernetes</h1>
          <p className="text-white/60">
            Manage and provision your Kubernetes clusters.
          </p>
        </div>
        <Link
          href="/dashboard/services/kubernetes/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          New Kubernetes
        </Link>
      </motion.div>

      {clusters.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-slate-1000 ring-1 ring-slate-700 shadow-lg text-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-700/50 text-white">
                <tr>
                  <Th>Cluster</Th>
                  <Th>Nodes</Th>
                  {/* <Th>Created</Th> */}
                  <Th>Version</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 bg-white/5">
                {clusters.map((c) => (
                  <tr
                    key={c.cluster_id}
                    className="hover:bg-slate-700/30 transition-colors duration-150"
                  >
                    <Td>
                      <div className="font-medium text-white">
                        {c.cluster_name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        {c.cluster_id}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-slate-200">
                        {c.workers?.length || 0}
                      </span>
                    </Td>
                    
                     <Td>
                      <span className="text-slate-300">{c.k8s_version || 'N/A'}</span>
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          c.status === "ready"
                            ? "bg-green-500/20 text-green-400"
                            : c.status === "pending"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : c.status === "failed"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-slate-500/20 text-slate-400"
                        }`}
                      >
                        {c.status || 'unknown'}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            if (c.cluster_id) downloadKubeconfig(c.cluster_id);
                          }}
                          className="cursor-pointer rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors duration-200"
                        >
                          Download kubeconfig
                        </button>
                        <Link
                          href={{
                            pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(c.cluster_id || '')}`,
                            query: { clusterStatus: c.status },
                          }}
                          className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 transition-colors duration-200"
                        >
                          View Cluster
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center py-20 border-2 border-dashed border-white/10 rounded-lg"
        >
          <DockIcon className="mx-auto h-16 w-16 text-white/20" />
          <h3 className="mt-4 text-xl font-semibold">No Kubernetes Found</h3>
          <p className="mt-2 text-sm text-white/50">
            Get started by provisioning a new Kubernetes cluster.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard/services/kubernetes/new"
              className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Create Cluster
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-6 py-4 text-sm text-slate-800 align-middle">
      {children}
    </td>
  );
}

export default KubernetesClustersMain;
