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
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Graph from "./graph";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  transformCpuData,
  transformDiskData,
  transformMemoryData,
} from "@/config/functions";
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

function SingleCluster({ clusterId }: { clusterId: string }) {
  const [status, setStatus] = useState<CheckStatus>({
    createStatus: false,
    connectStatus: false,
    verifyStatus: false,
  });

  const [loading, setLoading] = useState(false);

  const [clusterData, setClusterData] = useState<CheckStatus | null>(null);
  const [nodesData, setNodesData] = useState<NodeInfo | null>(null);
  // const router=useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  // const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Lines 65-67 - Replace with proper typing
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphMetadata, setGraphMetadata] = useState<{
    metricType: string;
    nodeId: string;
    nodeIp: string;
    timeRange: number;
  } | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const alertedRef = useRef(false);
  const router = useRouter();

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

  const onDeleteNode = async (droplet_id: [string], index?: number) => {
    //debugger

    if (index === 0) {
      toast.error("You cannot delete control plane node");
      return;
    }
    setLoading(true);
    for (let i = 0; i < droplet_id.length; i++) {
      const res = await api.post(`/services/kubernetes/manageip/delete`, {
        droplet_id: droplet_id[i],
      });

      if (res.status === 200) {
        const delNode = await api.post(
          "/services/kubernetes/clusters/delete_node",
          {
            droplet_id: droplet_id[i],
            cluster_id: clusterId,
          }
        );

        if (delNode.status === 200) {
          toast.success("Node deleted successfully");
        }

        if (nodesData && nodesData?.length > 0) {
          setNodesData((prev) =>
            prev ? prev.filter((n) => n.droplet_id !== droplet_id[i]) : []
          );
        }
      }
    }
    setLoading(false);
  };

  const onDeleteCluster = async () => {
    if (!nodesData) {
      console.error("nodesData is null or undefined");
      return; // Exit early if nodesData is null or undefined
    }

    setLoading(true);
    for (let i = 0; i < nodesData.length; i++) {
      const res = await api.post(`/services/kubernetes/manageip/delete`, {
        droplet_id: nodesData[i].droplet_id,
      });

      console.log(
        res.status,
        ".............res from delete node api..........."
      );

      // if (res.status === 200) {
      //   continue;
      // }
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

  // Lines 276-302 - Replace with this improved version
  const ViewGraph = async (
    droplet_id: string,
    hrs: number,
    type: string,
    nodeIp: string,
    //index: number
  ) => {
    try {
      setLoading(true);

      const res = await api.post<MonitoringResponse>(
        `/services/kubernetes/clusters/monitering`,
        {
          droplet_id: droplet_id,
          type: type,
          hrs: hrs,
        }
      );

      if (res.status === 200 && res.data.matrix) {
        // Validate response structure
        if (!Array.isArray(res.data.matrix) || res.data.matrix.length === 0) {
          toast.error("No monitoring data available");
          return;
        }

        // Transform the data based on metric type
        let transformedData: GraphData;

        switch (type) {
          case "cpu":
            transformedData = transformCpuData(res.data.matrix);
            break;
          case "memory_free":
            transformedData = transformMemoryData(res.data.matrix);
            break;
          case "filesystem_free":
            transformedData = transformDiskData(res.data.matrix);
            break;
          default:
            toast.error("Unknown metric type");
            return;
        }

        setGraphData(transformedData);
        setGraphMetadata({
          metricType: type,
          nodeId: droplet_id,
          nodeIp: nodeIp,
          timeRange: hrs,
        });
        setGraphOpen(true);

        toast.success("Monitoring data loaded");
      } else {
        toast.error("Failed to fetch monitoring data");
      }
    } catch (error) {
      console.error("[ViewGraph] Error:", error);
      toast.error("Failed to load monitoring insights");
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

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-white/60">
              {/* Cluster:{" "} */}
              <h2 className="text-2xl font-semibold text-white mb-1">
                {ready
                  ? "Your Cluster is ready"
                  : "Getting Started with Kubernetes"}
              </h2>
            </div>
            {ready && (
              <button
                onClick={() => onDeleteCluster()}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-red-900/30 text-red-400 border-2 border-red-600 px-4 py-2 text-sm font-medium transition-all hover:bg-red-800/40 hover:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
                Delete cluster
              </button>
            )}
          </div>
        </motion.div>

         {
          ready===false &&
         
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white/5 shadow-lg ring-1 ring-white/10 p-6 md:p-8 space-y-5"
        >
           {steps.map((s, idx) => {
            const done = status[s.key];
            const inProgress = !done && idx === currentIndex;
            if (ready === false) {
              return (
                <StepRow
                  key={s.key}
                  label={s.label}
                  done={done}
                  inProgress={inProgress}
                />
              );
            } else {
              return (
                <StepRow
                  key={s.key}
                  label={s.label}
                  done={true}
                  inProgress={false}
                />
              );
            }
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
         }

         
       

        {ready && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl my-2 bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">
                  Kubeconfig
                </h3>
                {ready && (
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
                )}
              </div>
              <p className="text-sm text-white/60">
                This file contains credentials for accessing your cluster. Store
                it securely and avoid committing it to version control.
              </p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl my-2 bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-4"
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
              transition={{ delay: 0.4 }}
              className="rounded-2xl my-2 bg-white/5 shadow-lg ring-1 ring-white/10 p-6 space-y-4"
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
                      <th className="py-3 pr-4 font-medium">CPU</th>
                      <th className="py-3 pr-4 font-medium">Memory</th>
                      <th className="py-3 pr-4 font-medium">Disk</th>
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

                        <td className="py-3 pr-4">
                          <button
                            onClick={() =>
                              ViewGraph(
                                n.droplet_id,
                                1,
                                "cpu",
                                n.public_ip,
                                //index
                              )
                            }
                            disabled={loading}
                            className={`inline-flex items-center gap-1 rounded-lg border border-2 border-green-500 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-500/20 hover:text-green-300 transition-colors ${
                              loading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            {loading ? (
                              <>
                                <Spinner />
                                Loading...
                              </>
                            ) : (
                              "View insight"
                            )}
                          </button>
                        </td>

                        <td className="py-3 pr-4">
                          <button
                            onClick={() =>
                              ViewGraph(
                                n.droplet_id,
                                1,
                                "memory_free",
                                n.public_ip,
                                //index
                              )
                            }
                            disabled={loading}
                            className={`inline-flex items-center gap-1 rounded-lg border border-2 border-green-500 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-500/20 hover:text-green-300 transition-colors ${
                              loading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            {loading ? <Spinner /> : "View insight"}
                          </button>
                        </td>

                        <td className="py-3 pr-4">
                          <button
                            onClick={() =>
                              ViewGraph(
                                n.droplet_id,
                                1,
                                "filesystem_free",
                                n.public_ip,
                               // index
                              )
                            }
                            disabled={loading}
                            className={`inline-flex items-center gap-1 rounded-lg border border-2 border-green-500 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-500/20 hover:text-green-300 transition-colors ${
                              loading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            {loading ? <Spinner /> : "View insight"}
                          </button>
                        </td>
                        <td className="py-3 pr-0 text-right">
                          <button
                            onClick={() => onDeleteNode([n.droplet_id], index)}
                            className="inline-flex items-center gap-1 rounded-lg text-red-400 border border-2 border-red-500 px-2.5 py-1.5 text-xs hover:bg-red-500/20 hover:text-red-300 transition-colors"
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
          </>
        )}
      </div>

      {graphOpen && graphData && graphMetadata && (
        <Graph
          open={graphOpen}
          setGraphOpenAction={setGraphOpen}
          data={graphData}
          metadata={{
            title: `${graphMetadata.metricType.toUpperCase()} Metrics`,
            nodeIp: graphMetadata.nodeIp,
            nodeId: graphMetadata.nodeId,
            timeRange: graphMetadata.timeRange,
          }}
        />
      )}
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

// function StatusDot({
//   done,
//   inProgress,
// }: {
//   done: boolean;
//   inProgress: boolean;
// }) {
//   if (done) {
//     return (
//       <span
//         className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500"
//         aria-label="done"
//       >
//         <svg
//           viewBox="0 0 20 20"
//           fill="none"
//           className="h-4 w-4"
//           aria-hidden="true"
//         >
//           <path
//             d="M5 10.5l3 3 7-7"
//             stroke="white"
//             strokeWidth="2"
//             strokeLinecap="round"
//             strokeLinejoin="round"
//           />
//         </svg>
//       </span>
//     );
//   }
//   if (inProgress) {
//     return (
//       <span
//         className="inline-flex h-6 w-6 rounded-full bg-blue-500"
//         aria-label="in progress"
//         title="in progress"
//       />
//     );
//   }
//   return (
//     <span
//       className="inline-flex h-6 w-6 rounded-full ring-2 ring-slate-300 bg-white"
//       aria-label="pending"
//       title="pending"
//     />
//   );
// }

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

export default SingleCluster;
