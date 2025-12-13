"use client";
import api from "@/lib/axios/axios";
// import { Json } from "@/lib/supabase/types";
import {
  Check,
  Cpu,
  Download,
  HardDrive,
  LucideIcon,
  MemoryStick,
  Trash2,
  Settings,
  BarChart3,
  FolderOpen,
  AlertTriangle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  transformCpuData,
  transformDiskData,
  transformMemoryData,
} from "@/config/functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
// import { read } from "fs";

type CheckStatus = {
  createStatus: boolean;
  connectStatus: boolean;
  verifyStatus: boolean;
  clusterInfo?: Row | null;
};

type Row = {
  createStatus: boolean;
  connectStatus: boolean;
  verifyStatus: boolean;
  status: "pending" | "creating" | "ready" | "failed" | "deleted" | null;
  kubeconfig: string | null;
  node_config: { cpu: number; ram: number; storage: number } | null;
  control_plane: {
    public_ip: string;
    private_ip: string;
    droplet_id: string;
  } | null;
  workers:
    | { public_ip: string; private_ip: string; droplet_id: string }[]
    | null;
};

type NodeInfo =
  | { public_ip: string; private_ip: string; droplet_id: string }[]
  | null;

// Add these types at the top of your file
// interface MetricValue {
//   timestamp: number;
//   value: string | number;
// }

interface CpuMetric {
  metric: {
    host_id: string;
    mode:
      | "idle"
      | "iowait"
      | "irq"
      | "nice"
      | "softirq"
      | "steal"
      | "system"
      | "user";
  };
  values: [number, string][]; // [timestamp, value]
}

interface MonitoringResponse {
  data: {
    status: string;
    data: {
      resultType: string;
      result: CpuMetric[];
    };
  };
  matrix: CpuMetric[];
  message: string;
}

interface GraphData {
  labels: string[]; // Timestamps for X-axis
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

interface Project {
  id: string;
  name: string;
  owner: string;
}

interface InsightGraphsData {
  cpu: GraphData | null;
  memory: GraphData | null;
  disk: GraphData | null;
}

function SingleCluster({
  clusterId,
  userProjects,
}: {
  clusterId: string;
  userProjects: Project[];
}) {
  const [status, setStatus] = useState<CheckStatus>({
    createStatus: false,
    connectStatus: false,
    verifyStatus: false,
  });

  const [loading, setLoading] = useState(false);
  const [clusterData, setClusterData] = useState<CheckStatus | null>(null);
  const [nodesData, setNodesData] = useState<NodeInfo | null>(null);
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("cluster");

  // Insight tab state
  const [selectedNodeForInsight, setSelectedNodeForInsight] =
    useState<string>("");
  const [insightTimeRange, setInsightTimeRange] = useState<number>(1);
  const [insightGraphsData, setInsightGraphsData] = useState<InsightGraphsData>(
    {
      cpu: null,
      memory: null,
      disk: null,
    }
  );
  const [insightLoading, setInsightLoading] = useState(false);

  // Settings tab state
  const [projects] = useState<Project[]>(userProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("select");
  // const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentProjectId, setCurrentProjectId] = useState<string>("");

  // Delete confirmation dialogs state
  const [deleteNodeDialog, setDeleteNodeDialog] = useState(false);
  const [deleteClusterDialog, setDeleteClusterDialog] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<{
    droplet_id: string;
    index: number;
  } | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const alertedRef = useRef(false);
  const router = useRouter();

  // Handler to open node delete confirmation dialog
  const handleDeleteNodeClick = (droplet_id: string, index: number) => {
    if (index === 0) {
      toast.error("You cannot delete control plane node");
      return;
    }
    setNodeToDelete({ droplet_id, index });
    setDeleteNodeDialog(true);
  };

  // Handler to open cluster delete confirmation dialog
  const handleDeleteClusterClick = () => {
    setDeleteClusterDialog(true);
  };

  //const x = 10;
  const steps = useMemo(
    () =>
      [
        { key: "createStatus", label: "1. Create cluster" },
        { key: "connectStatus", label: "2. connectStatus cluster" },
        { key: "verifyStatus", label: "3. verifyStatus cluster" },
      ] as const,
    []
  );

  const allDone =
    status.createStatus && status.connectStatus && status.verifyStatus;
  const currentIndex = useMemo(() => {
    if (!status.createStatus) return 0;
    if (!status.connectStatus) return 1;
    if (!status.verifyStatus) return 2;
    return -1; // all done
  }, [status]);

  async function pollOnce() {
    //setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      //  debugger

      //const singleCluster=
      const res = await fetch("/api/services/kubernetes/clusters/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
        signal: ac.signal,
      });

      console.log(res.ok, ".............res.ok");

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Status API returned ${res.status}`);
      }

      const data = (await res.json()) as Partial<CheckStatus>;

      console.log(data, "........................................data");

      // Merge new truthy statuses without flipping any true back to false
      setStatus((prev) => ({
        createStatus: prev.createStatus || !!data.createStatus,
        connectStatus: prev.connectStatus || !!data.connectStatus,
        verifyStatus: prev.verifyStatus || !!data.verifyStatus,
      }));

      if (data.connectStatus && data.createStatus && data.verifyStatus) {
        setClusterData(data as CheckStatus);
        const workers = data?.clusterInfo?.workers ?? [];
        const controlPlane = data?.clusterInfo?.control_plane;

        const nodes = [...(controlPlane ? [controlPlane] : []), ...workers];

        setNodesData(nodes);
        setReady(true);
      }
      setLastUpdated(new Date());
    } catch (err: unknown) {
      console.log(err, ".........98");
      if (err instanceof Error) {
        //setError(err?.message || "Something went wrong while submitting.");
      } else {
        // setError("Something went wrong while submitting.");
      }
    }
  }

  const downloadKubeconfig = async (clusterId: string, kubeconfig: string) => {
    const res = await fetch("/api/services/kubernetes/clusters/downloadkube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kubeconfig }),
    });

    if (res.ok) {
      const data = await res.json();

      // Use the YAML string directly without JSON.stringify
      const yamlContent = data.data;

      const blob = new Blob([yamlContent], { type: "application/x-yaml" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${clusterId}.yaml`; // Changed extension to .yaml
      a.click();

      // Optional: revoke the URL after some time
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      console.error("Failed to download kubeconfig");
    }
  };

  const onDeleteNode = async () => {
    if (!nodeToDelete) return;

    const { droplet_id } = nodeToDelete;
    setLoading(true);
    setDeleteNodeDialog(false);

    const res = await api.post(`/services/kubernetes/manageip/delete`, {
      droplet_id: droplet_id,
    });

    if (res.status === 200) {
      const delNode = await api.post(
        "/services/kubernetes/clusters/delete_node",
        {
          droplet_id: droplet_id,
          cluster_id: clusterId,
        }
      );

      if (delNode.status === 200) {
        toast.success("Node deleted successfully");
      }

      if (nodesData && nodesData?.length > 0) {
        setNodesData((prev) =>
          prev ? prev.filter((n) => n.droplet_id !== droplet_id) : []
        );
      }
    }
    setLoading(false);
    setNodeToDelete(null);
  };

  const onDeleteCluster = async () => {
    if (!nodesData) {
      console.error("nodesData is null or undefined");
      return;
    }

    debugger

    setLoading(true);
    setDeleteClusterDialog(false);

    for (let i = 0; i < nodesData.length; i++) {
      await api.post(`/services/kubernetes/manageip/delete`, {
        droplet_id: nodesData[i].droplet_id,
      });
    }

    const delCluster = await api.post(`/services/kubernetes/clusters/delete`, {
      cluster_id: clusterId,
    });

    if (delCluster.status === 200) {
      toast.success("Cluster deleted successfully");
      router.push("/dashboard/services/kubernetes");
    }
    setLoading(false);
  };

  // Fetch all insights for a node
  const fetchNodeInsights = async (dropletId: string, hrs: number) => {
    if (!dropletId) {
      toast.error("Please select a node");
      return;
    }

    setInsightLoading(true);

    try {
      // Fetch all three metrics in parallel
      const [cpuRes, memoryRes, diskRes] = await Promise.all([
        api.post<MonitoringResponse>(
          `/services/kubernetes/clusters/monitering`,
          {
            droplet_id: dropletId,
            type: "cpu",
            hrs: hrs,
          }
        ),
        api.post<MonitoringResponse>(
          `/services/kubernetes/clusters/monitering`,
          {
            droplet_id: dropletId,
            type: "memory_free",
            hrs: hrs,
          }
        ),
        api.post<MonitoringResponse>(
          `/services/kubernetes/clusters/monitering`,
          {
            droplet_id: dropletId,
            type: "filesystem_free",
            hrs: hrs,
          }
        ),
      ]);

      // Transform the data
      const cpuData =
        cpuRes.status === 200 && cpuRes.data.matrix?.length
          ? transformCpuData(cpuRes.data.matrix)
          : null;
      const memoryData =
        memoryRes.status === 200 && memoryRes.data.matrix?.length
          ? transformMemoryData(memoryRes.data.matrix)
          : null;
      const diskData =
        diskRes.status === 200 && diskRes.data.matrix?.length
          ? transformDiskData(diskRes.data.matrix)
          : null;

      setInsightGraphsData({
        cpu: cpuData,
        memory: memoryData,
        disk: diskData,
      });

      if (!cpuData && !memoryData && !diskData) {
        toast.error("No monitoring data available");
      } else {
        toast.success("Monitoring data loaded");
      }
    } catch (error) {
      console.error("[fetchNodeInsights] Error:", error);
      toast.error("Failed to load monitoring insights");
      setInsightGraphsData({ cpu: null, memory: null, disk: null });
    } finally {
      setInsightLoading(false);
    }
  };

  // Update cluster project
  const updateClusterProject = async () => {
    if (!selectedProjectId) {
      toast.error("Please select a project");
      return;
    }

    if (selectedProjectId === currentProjectId) {
      toast.info("This cluster is already in the selected project");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        "/services/kubernetes/clusters/update_project",
        {
          cluster_id: clusterId,
          project_id: selectedProjectId,
        }
      );

      if (res.status === 200) {
        toast.success("Cluster project updated successfully");
        setCurrentProjectId(selectedProjectId);
      } else {
        toast.error("Failed to update cluster project");
      }
    } catch (error) {
      console.error("[updateClusterProject] Error:", error);
      toast.error("Failed to update cluster project");
    } finally {
      setLoading(false);
    }
  };

  // Stop polling once all steps complete (and alert once)
  useEffect(() => {
    if (allDone) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      abortRef.current?.abort();
      if (!alertedRef.current) {
        //  debugger;
        alertedRef.current = true;
        // const check = searchParams.get("clusterStatus");
        if (searchParams.get("clusterStatus") != "ready") {
          // alert("Cluster is ready!");
          toast.success("Cluster is ready!");
        }
      }
    }
  }, [allDone, searchParams]);

  // Start polling on mount, stop on unmount
  useEffect(() => {
    // immediate check
    pollOnce();
    // then poll every 60s
    pollRef.current = setInterval(pollOnce, 60_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  // Load user data when cluster is ready
  // useEffect(() => {
  //   if (ready && clusterData?.clusterInfo) {
  //     // Get current user from the API or session
  //     const loadUserData = async () => {
  //       try {
  //         const res = await api.get("/profile/read");
  //         if (res.status === 200 && res.data.user) {
  //           const userId = res.data.user.id;
  //           setCurrentUserId(userId);
  //         }
  //       } catch (error) {
  //         console.error("[loadUserData] Error:", error);
  //       }
  //     };

  //     loadUserData();

  //     // Set initial selected node for insights
  //     if (nodesData && nodesData.length > 0) {
  //       setSelectedNodeForInsight(nodesData[0].droplet_id);
  //     }
  //   }
  // }, [ready, clusterData, nodesData]);

  // Fetch cluster project_id to set current project
  useEffect(() => {
    if (ready && clusterId) {
      const fetchClusterProject = async () => {
        try {
          const res = await api.post("/services/kubernetes/clusters/read", {
            cluster_id: clusterId,
          });
          if (res.status === 200 && res.data.cluster?.project_id) {
            setCurrentProjectId(res.data.cluster.project_id);
            setSelectedProjectId(res.data.cluster.project_id);
          }
        } catch (error) {
          console.error("[fetchClusterProject] Error:", error);
        }
      };

      fetchClusterProject();
    }
  }, [ready, clusterId]);

  // Auto-load insights when node or time range changes in Insight tab
  useEffect(() => {
    if (activeTab === "insight" && selectedNodeForInsight && ready) {
      fetchNodeInsights(selectedNodeForInsight, insightTimeRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeForInsight, insightTimeRange, activeTab]);

  if (loading && !ready) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black py-10 px-4">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-semibold text-white mb-1">
            {ready
              ? "Kubernetes Cluster Management"
              : "Getting Started with Kubernetes"}
          </h2>
          <p className="text-white/60 text-sm">
            {ready
              ? "Manage your cluster, monitor performance, and configure settings"
              : "Setting up your Kubernetes cluster..."}
          </p>
        </motion.div>

        {ready === false && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 md:p-8 space-y-5"
          >
            {steps.map((s, idx) => {
              const done = status[s.key];
              const inProgress = !done && idx === currentIndex;
              return (
                <StepRow
                  key={s.key}
                  label={s.label}
                  done={done}
                  inProgress={inProgress}
                />
              );
            })}

            <div className="flex items-center justify-between text-xs text-white/60 pt-2">
              <div className="flex items-center gap-2">
                {!allDone ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    <span>Checking status every 1 minute…</span>
                  </span>
                ) : (
                  <span className="text-green-400 font-medium">
                    All steps complete.
                  </span>
                )}
              </div>
              <div>
                {lastUpdated ? (
                  <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
                ) : (
                  <span>Waiting for first update…</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {ready && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3 bg-white/10">
              <TabsTrigger
                value="cluster"
                className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-black"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Cluster
              </TabsTrigger>
              <TabsTrigger
                value="insight"
                className="cursor-pointerdata-[state=active]:bg-white data-[state=active]:text-black"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Insight
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="cursor-pointer data-[state=active]:bg-white data-[state=active]:text-black"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>

            {/* CLUSTER TAB */}
            <TabsContent value="cluster" className="mt-6 space-y-4">
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">
                    Kubeconfig
                  </h3>
                  <button
                    onClick={() => {
                      downloadKubeconfig(
                        clusterId,
                        clusterData?.clusterInfo?.kubeconfig || ""
                      );
                    }}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-black font-medium hover:bg-gray-200 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download kubeconfig
                  </button>
                </div>
                <p className="text-sm text-white/60">
                  This file contains credentials for accessing your cluster.
                  Store it securely and avoid committing it to version control.
                </p>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-4"
              >
                <h3 className="text-base font-semibold text-white">
                  Cluster Resources
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    icon={Cpu}
                    label="vCPU"
                    value={`${clusterData?.clusterInfo?.node_config?.cpu || 0} vCPU`}
                    sub="Total allocated"
                  />
                  <StatCard
                    icon={MemoryStick}
                    label="Memory"
                    value={`${clusterData?.clusterInfo?.node_config?.ram || 0} MB`}
                    sub="Total RAM"
                  />
                  <StatCard
                    icon={HardDrive}
                    label="Storage"
                    value={`${clusterData?.clusterInfo?.node_config?.storage || 0} GB`}
                    sub="Total disk"
                  />
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">Nodes</h3>
                  <div className="text-xs text-white/60">
                    {nodesData?.length || 0} total
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-white/70">
                      <tr className="border-b border-white/10">
                        <th className="py-3 pr-4 font-medium">Public IP</th>
                        <th className="py-3 pr-4 font-medium">Role</th>
                        <th className="py-3 pr-4 font-medium">Private IP</th>
                        <th className="py-3 pr-4 text-right font-medium">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {nodesData?.map((n, index) => (
                        <tr
                          key={index}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 pr-4 font-medium text-white">
                            {n.public_ip}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {index === 0 ? "control-plane" : "worker"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {n.private_ip}
                          </td>
                          <td className="py-3 pr-0 text-right">
                            <button
                              onClick={() =>
                                handleDeleteNodeClick(n.droplet_id, index)
                              }
                              disabled={loading}
                              className="cursor-pointer inline-flex items-center gap-1 rounded-lg text-red-400 border border-2 border-red-500 px-2.5 py-1.5 text-xs hover:bg-red-500/20 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            </TabsContent>

            {/* INSIGHT TAB */}
            <TabsContent value="insight" className="mt-6 space-y-4">
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-6"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      Node Monitoring
                    </h3>
                    <p className="text-sm text-white/60 mt-1">
                      View real-time metrics for your cluster nodes
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <Select
                      value={selectedNodeForInsight}
                      onValueChange={setSelectedNodeForInsight}
                    >
                      <SelectTrigger className="w-full sm:w-[200px] bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Select a node" />
                      </SelectTrigger>
                      <SelectContent>
                        {nodesData?.map((node, index) => (
                          <SelectItem
                            key={node.droplet_id}
                            value={node.droplet_id}
                          >
                            {node.public_ip} (
                            {index === 0 ? "control-plane" : "worker"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={String(insightTimeRange)}
                      onValueChange={(val) => setInsightTimeRange(Number(val))}
                    >
                      <SelectTrigger className="w-full sm:w-[140px] bg-white/10 border-white/20 text-white">
                        <SelectValue placeholder="Time range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Last 1 hour</SelectItem>
                        <SelectItem value="6">Last 6 hours</SelectItem>
                        <SelectItem value="12">Last 12 hours</SelectItem>
                        <SelectItem value="24">Last 24 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {insightLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-white/60 text-sm">
                        Loading monitoring data...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <GraphCard
                      title="CPU Usage"
                      data={insightGraphsData.cpu}
                      color="#3b82f6"
                    />
                    <GraphCard
                      title="Memory Free"
                      data={insightGraphsData.memory}
                      color="#a855f7"
                    />
                    <GraphCard
                      title="Disk Free"
                      data={insightGraphsData.disk}
                      color="#ec4899"
                    />
                  </div>
                )}
              </motion.section>
            </TabsContent>

            {/* SETTINGS TAB */}
            <TabsContent value="settings" className="mt-6 space-y-4">
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-6"
              >
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">
                    Project Assignment
                  </h3>
                  <p className="text-sm text-white/60">
                    Assign this cluster to a different project
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Select
                    value={selectedProjectId}
                    onValueChange={setSelectedProjectId}
                  >
                    <SelectTrigger className="w-full sm:flex-1 bg-white/10 border-white/20 text-white">
                      <SelectValue
                        placeholder="Select a project"
                        className="text-white"
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                          {project.id === currentProjectId && " (current)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <button
                    onClick={updateClusterProject}
                    disabled={loading || !selectedProjectId}
                    className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 text-white font-medium px-6 py-2 text-sm font-medium text-white hover:bg-slate-1000 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Spinner /> : <Check className="h-4 w-4" />}
                    Update Project
                  </button>
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl bg-red-900/20 shadow-lg ring-1 ring-red-500/50 p-6 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-red-400 mb-1">
                      Danger Zone
                    </h3>
                    <p className="text-sm text-red-300/80">
                      Deleting this cluster will permanently remove all nodes
                      and data. This action cannot be undone.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleDeleteClusterClick}
                  disabled={loading}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-red-600 text-white px-6 py-2.5 text-sm font-medium transition-all hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                  Delete Cluster
                </button>
              </motion.section>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Delete Node Confirmation Dialog */}
      <AlertDialog open={deleteNodeDialog} onOpenChange={setDeleteNodeDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Node
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              Are you sure you want to delete this node? This action cannot be
              undone.
              {nodeToDelete && (
                <div className="mt-2 p-2 bg-slate-800 rounded text-sm">
                  <span className="text-slate-400">Node IP: </span>
                  <span className="text-white font-mono">
                    {
                      nodesData?.find(
                        (n) => n.droplet_id === nodeToDelete.droplet_id
                      )?.public_ip
                    }
                  </span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteNode}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete Node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Cluster Confirmation Dialog */}
      <AlertDialog
        open={deleteClusterDialog}
        onOpenChange={setDeleteClusterDialog}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Cluster
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              Are you sure you want to delete this entire cluster? This will
              permanently remove:
              <ul className="mt-2 ml-4 list-disc text-sm space-y-1">
                <li>
                  All {nodesData?.length || 0} nodes (control plane and workers)
                </li>
                <li>All cluster data and configurations</li>
                <li>All associated resources</li>
              </ul>
              <p className="mt-3 text-red-400 font-semibold">
                This action cannot be undone!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteCluster}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete Cluster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --- UI bits --- */
function StepRow({
  label,
  done,
  inProgress,
}: {
  label: string;
  done: boolean;
  inProgress: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
          done ? "bg-green-500" : inProgress ? "bg-blue-500" : "bg-white/20"
        }`}
      >
        {done && <Check className="h-4 w-4 text-white" />}
        {inProgress && <Spinner />}
      </div>
      <span
        className={`text-sm transition-colors ${
          done ? "text-white" : inProgress ? "text-white" : "text-white/60"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-white/10 p-2">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-medium text-white/70">{label}</div>
          <div className="text-lg font-semibold text-white">{value}</div>
          <div className="text-xs text-white/50">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function GraphCard({
  title,
  data,
  color,
}: {
  title: string;
  data: GraphData | null;
  color: string;
}) {
  if (!data || !data.labels || data.labels.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-6 ring-1 ring-white/10">
        <h4 className="text-sm font-semibold text-white mb-4">{title}</h4>
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-center">
            <p className="text-white/50 text-sm">No data available</p>
          </div>
        </div>
      </div>
    );
  }

  // Transform data for recharts
  const chartData = data.labels.map((label, index) => {
    const point: Record<string, string | number> = { time: label };
    data.datasets.forEach((dataset) => {
      point[dataset.label] = dataset.data[index] || 0;
    });
    return point;
  });

  // Calculate statistics
  const mainDataset = data.datasets[0];
  const values = mainDataset.data;
  const latest = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  return (
    <div className="rounded-xl bg-white/5 p-4 md:p-6 ring-1 ring-white/10 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h4 className="text-base font-semibold text-white">{title}</h4>
        <div className="flex items-center gap-3 sm:gap-4 text-xs">
          <div>
            <span className="text-white/50">Current: </span>
            <span className="text-white font-semibold">
              {latest.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-white/50">Avg: </span>
            <span className="text-white font-semibold">{avg.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="h-[300px] md:h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.1)"
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
              width={50}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.9)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.8)" }}
              itemStyle={{ color: color }}
            />
            {data.datasets.map((dataset) => (
              <Line
                key={dataset.label}
                type="monotone"
                dataKey={dataset.label}
                stroke={dataset.borderColor || color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10">
        <div className="text-xs">
          <span className="text-white/50">Min: </span>
          <span className="text-green-400 font-semibold">{min.toFixed(2)}</span>
        </div>
        <div className="text-xs text-right">
          <span className="text-white/50">Max: </span>
          <span className="text-red-400 font-semibold">{max.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default SingleCluster;
