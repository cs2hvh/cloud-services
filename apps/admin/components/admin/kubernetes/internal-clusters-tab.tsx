"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  Server,
  ChevronLeft,
  ChevronRight,
  Layers,
  RefreshCw,
  Trash2,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Admin_KubernetesCluster } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getErrorMessage } from "@/config/functions";
import axios from "axios";
import { format } from "date-fns";
import CreateInternalClusterDialog from "./create-internal-cluster-dialog";

interface Props {
  all_clusters: Admin_KubernetesCluster[];
}

const CLUSTERS_PER_PAGE = 10;

const getStatusColor = (status: string) => {
  switch (status) {
    case "ready":
      return "bg-green-500/20 text-green-400 border-green-900";
    case "creating":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-900";
    case "failed":
      return "bg-red-500/20 text-red-400 border-red-900";
    case "pending":
      return "bg-blue-500/20 text-blue-400 border-blue-900";
    default:
      return "bg-slate-500/20 text-slate-400 border-slate-700";
  }
};

const getNodeCount = (cluster: Admin_KubernetesCluster) => {
  return (cluster.control_plane ? 1 : 0) + (cluster.workers?.length ?? 0);
};

export default function InternalClustersTab({ all_clusters }: Props) {
  const router = useRouter();

  // Only show internal clusters (identified by explicit provision_config.type, not project_id nullness)
  const internalClusters = all_clusters.filter((c) => c.node_config?.provision_config?.type === "internal");

  const [localClusters, setLocalClusters] = useState(internalClusters);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [selectedClusterName, setSelectedClusterName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const getFiltered = () => {
    if (!searchQuery.trim()) return localClusters;
    const q = searchQuery.toLowerCase();
    return localClusters.filter(
      (c) =>
        c.cluster_name?.toLowerCase().includes(q) ||
        c.cluster_id?.toLowerCase().includes(q) ||
        c.k8s_version?.toLowerCase().includes(q) ||
        c.status?.toLowerCase().includes(q),
    );
  };

  const filtered = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / CLUSTERS_PER_PAGE));
  const pageClusters = filtered.slice(
    (currentPage - 1) * CLUSTERS_PER_PAGE,
    currentPage * CLUSTERS_PER_PAGE,
  );

  const handlePageChange = (p: number) => {
    if (p >= 1 && p <= totalPages) setCurrentPage(p);
  };

  const openDeleteDialog = (clusterId: string, clusterName: string) => {
    setSelectedClusterId(clusterId);
    setSelectedClusterName(clusterName);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedClusterId) return;
    try {
      setIsDeleting(true);
      await axios.post("/api/admin/kubernetes/clusters/delete", {
        cluster_id: selectedClusterId,
      });
      toast.success(`Cluster "${selectedClusterName}" deleted`);
      const updated = localClusters.filter((c) => c.cluster_id !== selectedClusterId);
      setLocalClusters(updated);
      const newTotalPages = Math.max(1, Math.ceil(updated.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return c.cluster_name?.toLowerCase().includes(q) || c.cluster_id?.toLowerCase().includes(q);
      }).length / CLUSTERS_PER_PAGE));
      if (currentPage > newTotalPages) setCurrentPage(newTotalPages);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete cluster"));
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
            <Input
              placeholder="Search by name, ID, version, status…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground/70 focus:border-border focus:ring-0"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.refresh()}
            className="text-muted-foreground hover:text-foreground hover:bg-white/[0.06] h-10 w-10 shrink-0"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CreateInternalClusterDialog onCreated={() => router.refresh()} />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { label: "Total", value: localClusters.length },
            {
              label: "Ready",
              value: localClusters.filter((c) => c.status === "ready").length,
            },
            {
              label: "Pending / Creating",
              value: localClusters.filter(
                (c) => c.status === "pending" || c.status === "creating",
              ).length,
            },
          ] as { label: string; value: number }[]
        ).map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card px-4 py-3"
          >
            <p className="text-xs text-muted-foreground/70 mb-1">{label}</p>
            <p className="text-xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {isDeleting ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 text-foreground animate-spin" />
        </div>
      ) : pageClusters.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-3"
        >
          <div className="p-3 bg-white/[0.06] rounded-lg">
            <Layers className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">No internal clusters yet</p>
          <p className="text-muted-foreground/50 text-sm text-center max-w-xs">
            {searchQuery
              ? "No clusters match your search."
              : "Create your first internal cluster to host platform workloads."}
          </p>
          {!searchQuery && <CreateInternalClusterDialog onCreated={() => router.refresh()} />}
        </motion.div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/60">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Cluster</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">
                  Nodes
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">
                  K8s Version
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">
                  Created
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageClusters.map((cluster, i) => (
                <motion.tr
                  key={cluster.cluster_id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border last:border-0 bg-neutral-950 hover:bg-card/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-white/[0.06] rounded">
                        <Server className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-foreground">{cluster.cluster_name}</p>
                          <Badge variant="outline" className="text-[10px] border-violet-800/60 text-violet-400 bg-violet-950/30 px-1.5 py-0 leading-4">
                            Internal
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground/70 font-mono">
                          {cluster.cluster_id.slice(0, 8)}…
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-xs capitalize ${getStatusColor(cluster.status)}`}
                    >
                      {cluster.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground/80 hidden sm:table-cell">
                    {getNodeCount(cluster)}
                  </td>
                  <td className="px-4 py-3 text-foreground/80 font-mono text-xs hidden md:table-cell">
                    {cluster.k8s_version ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground/70 text-xs hidden lg:table-cell">
                    {cluster.created_at
                      ? format(new Date(cluster.created_at), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        openDeleteDialog(
                          cluster.cluster_id,
                          cluster.cluster_name ?? "Unknown",
                        )
                      }
                      className="h-8 px-3 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 border-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground/70">
            Page {currentPage} of {totalPages} · {filtered.length} cluster
            {filtered.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="text-muted-foreground hover:text-foreground hover:bg-white/[0.06] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="text-muted-foreground hover:text-foreground hover:bg-white/[0.06] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-400" />
            Delete Internal Cluster
          </AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/80">
            Are you sure you want to permanently delete this cluster? Any associated
            DigitalOcean droplets will also be deleted.
            <span className="mt-3 p-3 bg-white/[0.06] rounded-md border border-border block">
              <span className="text-sm text-muted-foreground block">Cluster name</span>
              <span className="text-base font-semibold text-foreground">{selectedClusterName}</span>
            </span>
            <span className="mt-2 block text-xs text-red-400/80">
              This action cannot be undone even if the cluster is still being provisioned.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-white/[0.06] border-border text-foreground hover:bg-white/[0.08]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-red-600 hover:bg-red-700 text-foreground border-0"
          >
            Delete Cluster
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
