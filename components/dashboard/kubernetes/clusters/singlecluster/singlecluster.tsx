"use client";
import api from "@/lib/axios/axios";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronRight,
  Download,
  FolderOpen,
  Server,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

// ─── Design tokens ────────────────────────────────────────────────
const SERIF_STYLE: CSSProperties = {
  fontFamily: "var(--font-nunito), system-ui, sans-serif",
};
const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
const ACCENT = "#0095FF";
const ACCENT_BRIGHT = "#33adff";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  transformCpuData,
  transformDiskData,
  transformMemoryData,
} from "@/config/functions";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ServiceTabBar } from "@/components/dashboard/ui/service-tab-bar";
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
  createDropletStatus: boolean;
  createStatus: boolean;
  connectStatus: boolean;
  verifyStatus: boolean;
  clusterInfo?: Row | null;
};

type StatusResponse = Partial<CheckStatus> & {
  status?: Row["status"];
};

type ProvisionConfig = {
  region: string;
  size: string;
  version: string;
  node_count: number;
  node_names: string[];
  plan_id: string;
};

type Row = {
  cluster_name: string;
  create_droplet: boolean | null;
  createStatus: boolean;
  connectStatus: boolean;
  verifyStatus: boolean;
  status: "pending" | "creating" | "ready" | "failed" | "deleted" | null;
  kubeconfig: string | null;
  owner_id: string;
  project_id: string | null;
  node_config: {
    cpu: number;
    ram: number;
    storage: number;
    provision_config?: ProvisionConfig;
  } | null;
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
    createDropletStatus: false,
    createStatus: false,
    connectStatus: false,
    verifyStatus: false,
  });

  const [loading, setLoading] = useState(false);
  const [clusterData, setClusterData] = useState<CheckStatus | null>(null);
  const [clusterFailed, setClusterFailed] = useState(false);
  const [nodesData, setNodesData] = useState<NodeInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [clusterLifecycleStatus, setClusterLifecycleStatus] =
    useState<Row["status"] | null>(null);

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
  const dropletStartRef = useRef(false);
  const dropletFailureHandledRef = useRef(false);
  const readyStatusSyncRef = useRef(false);
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
        { key: "createDropletStatus", label: "1. Provision nodes" },
        { key: "createStatus", label: "2. Create cluster" },
        { key: "connectStatus", label: "3. Connect cluster" },
        { key: "verifyStatus", label: "4. Verify cluster" },
      ] as const,
    []
  );

  const allDone =
    status.createDropletStatus &&
    status.createStatus &&
    status.connectStatus &&
    status.verifyStatus;
  const currentIndex = useMemo(() => {
    if (!status.createDropletStatus) return 0;
    if (!status.createStatus) return 1;
    if (!status.connectStatus) return 2;
    if (!status.verifyStatus) return 3;
    return -1; // all done
  }, [status]);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const handleDropletCreationFailure = async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    abortRef.current?.abort();

    if (dropletFailureHandledRef.current) return;
    dropletFailureHandledRef.current = true;

    try {
      const response = await fetch("/api/services/kubernetes/clusters/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster_id: clusterId }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        console.error(
          "[handleDropletCreationFailure] Cluster cleanup failed:",
          errorData?.message || errorData?.error || response.statusText,
        );
      }
    } catch (deleteError) {
      console.error("[handleDropletCreationFailure] Failed to delete cluster:", deleteError);
    }

    toast.error("Cluster provisioning failed. Please try again.");
    router.push("/dashboard/services/kubernetes");
  };

  const startDropletCreation = async (clusterInfo: Row) => {
    if (dropletStartRef.current) return;

    const provisionConfig = clusterInfo.node_config?.provision_config;
    if (!provisionConfig || !clusterInfo.project_id) {
      return;
    }

    dropletStartRef.current = true;

    try {
      const createDropletRes = await fetch(
        "/api/services/kubernetes/manageip/createdroplet",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cluster_id: clusterId,
            names: provisionConfig.node_names,
            region: provisionConfig.region,
            size: provisionConfig.size,
            image: "ubuntu-24-04-x64",
            backups: false,
            ipv6: true,
            monitoring: true,
            tags: ["env:prod", "web", "ssh-allowed"],
            ownerId: clusterInfo.owner_id,
            plan_id: provisionConfig.plan_id,
            expected_node_count: provisionConfig.node_count + 1,
          }),
        }
      );

      if (createDropletRes.status === 402) {
        const errorData = (await createDropletRes.json().catch(() => null)) as
          | { error?: string; message?: string; balance?: number; required?: number }
          | null;
        toast.error(errorData?.message || errorData?.error || "Insufficient credits to start this cluster.");
        router.push("/dashboard/billing");
        return;
      }

      if (!createDropletRes.ok) {
        throw new Error("Failed to create nodes.");
      }

      const createDropletData = await createDropletRes.json();

      await fetch("/api/services/kubernetes/clusters/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_id: clusterId,
          status: "creating",
          create_droplet: true,
        }),
      });

      setStatus((prev) => ({ ...prev, createDropletStatus: true }));

      const sendPayload = {
        provider: "existing",
        cluster: {
          name: clusterInfo.cluster_name,
          location: provisionConfig.region,
          pod_cidr: "10.244.0.0/16",
          k8s_minor: provisionConfig.version,
        },
        auth: {
          method: "password",
          user: "root",
          password: createDropletData.vmPassword,
        },
        planId: provisionConfig.plan_id,
        nodes: [] as Array<{
          host: string;
          role: "control-plane" | "worker";
          hostname: string;
          cpu: number;
          memory_mb: number;
          storage: number;
          private_ip?: string;
          droplet_id?: number;
        }>,
        ips: [] as string[],
      };

      const actions = createDropletData?.data?.links?.actions || [];
      let counter = 0;
      const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max
      const pollStart = Date.now();

      while (counter < actions.length) {
        if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
          throw new Error("Node creation timed out after 10 minutes.");
        }

        const checkStatusRes = await fetch(
          "/api/services/kubernetes/manageip/dropletstatus",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: actions[counter].id }),
          }
        );

        if (!checkStatusRes.ok) {
          await sleep(10000);
          continue;
        }

        const checkStatusData = await checkStatusRes.json();
        if (checkStatusData?.data?.action?.status !== "completed") {
          await sleep(10000);
          continue;
        }

        const vmDataRes = await fetch(
          "/api/services/kubernetes/manageip/readdroplet",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: checkStatusData.data.action.resource_id,
            }),
          }
        );

        if (!vmDataRes.ok) {
          await sleep(5000);
          continue;
        }

        const vmData = await vmDataRes.json();
        const publicIp = vmData?.data?.droplet?.networks?.v4?.find(
          (item: { type: string; ip_address: string }) => item.type === "public"
        )?.ip_address;
        const privateIp = vmData?.data?.droplet?.networks?.v4?.find(
          (item: { type: string; ip_address: string }) => item.type === "private"
        )?.ip_address;

        if (!publicIp) {
          await sleep(5000);
          continue;
        }

        sendPayload.ips.push(publicIp);
        sendPayload.nodes.push({
          host: publicIp,
          role: counter === 0 ? "control-plane" : "worker",
          hostname: vmData.data.droplet.name,
          cpu: vmData.data.droplet.vcpus,
          memory_mb: vmData.data.droplet.memory,
          storage: vmData.data.droplet.disk,
          private_ip: privateIp,
          droplet_id: vmData.data.droplet.id,
        });
        counter++;
      }

      // Give droplets time to finish cloud-init/SSH readiness before provisioning.
      await sleep(120000);

      const startClusterRes = await fetch("/api/services/kubernetes/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clusterId,
          ...sendPayload,
          ownerId: clusterInfo.owner_id,
          projectId: clusterInfo.project_id,
        }),
      });

      if (!startClusterRes.ok) {
        throw new Error("Failed to start Kubernetes cluster provisioning.");
      }

      toast.success("Nodes created. Cluster provisioning started.");
      await pollOnce();
    } catch (error) {
      console.error("[startDropletCreation] Error:", error);
      await handleDropletCreationFailure();
    } finally {
      dropletStartRef.current = false;
    }
  };

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

      const data = (await res.json()) as StatusResponse;
      setClusterLifecycleStatus(data.clusterInfo?.status ?? data.status ?? null);
      const hasExistingNodes =
        !!data.clusterInfo?.control_plane ||
        (data.clusterInfo?.workers?.length || 0) > 0;
      const dropletStepDone =
        !!data.createDropletStatus ||
        hasExistingNodes ||
        data.clusterInfo?.status === "ready";

      console.log(data, "........................................data");

      // Check if cluster creation failed
      if (data.clusterInfo?.status === "failed") {
        setClusterFailed(true);
        setClusterData(data as CheckStatus);
        const workers = data?.clusterInfo?.workers ?? [];
        const controlPlane = data?.clusterInfo?.control_plane;
        const nodes = [...(controlPlane ? [controlPlane] : []), ...workers];
        setNodesData(nodes);
        
        // Stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        abortRef.current?.abort();
        
        
        //delete the cluster .
        const response=await api.post(`/services/kubernetes/clusters/delete`, {
          cluster_id: clusterId,
        })
        const settledResponse = response as typeof response & {
          error?: unknown;
          data?: { message?: string };
        };
        if (settledResponse.error) {
          toast.error(settledResponse.data?.message || "Failed to clean up cluster.");
          return;
        }
        if(response.status===200){
          router.push("/dashboard/services/kubernetes");
          toast.error(
          "Our server is facing some issue. Please try again later.",
          { duration: 8000 }
        );
        }
        
        return;
      }

      // Merge new truthy statuses without flipping any true back to false
      setStatus((prev) => ({
        createDropletStatus: prev.createDropletStatus || dropletStepDone,
        createStatus: prev.createStatus || !!data.createStatus,
        connectStatus: prev.connectStatus || !!data.connectStatus,
        verifyStatus: prev.verifyStatus || !!data.verifyStatus,
      }));

      if (
        !dropletStepDone &&
        data.clusterInfo?.status === "pending" &&
        !dropletStartRef.current
      ) {
        void startDropletCreation(data.clusterInfo);
      }

      if (
        dropletStepDone &&
        data.connectStatus &&
        data.createStatus &&
        data.verifyStatus
      ) {
        if (data.clusterInfo?.status !== "ready" && !readyStatusSyncRef.current) {
          readyStatusSyncRef.current = true;
          try {
            await fetch("/api/services/kubernetes/clusters/update-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cluster_id: clusterId,
                status: "ready",
              }),
            });
            setClusterLifecycleStatus("ready");
          } catch (readyStatusErr) {
            console.error("[pollOnce] Failed to sync ready status:", readyStatusErr);
            readyStatusSyncRef.current = false;
          }
        }

        setClusterData(data as CheckStatus);
        const workers = data?.clusterInfo?.workers ?? [];
        const controlPlane = data?.clusterInfo?.control_plane;

        const nodes = [...(controlPlane ? [controlPlane] : []), ...workers];

        setNodesData(nodes);
        setReady(true);
      }
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

    // Service layer handles DO droplet deletion + DB update + billing rate update
    const delNode = await api.post(
      "/services/kubernetes/clusters/delete_node",
      {
        droplet_id: droplet_id,
        cluster_id: clusterId,
      }
    );

    if (delNode.status === 200) {
      toast.success("Node deleted successfully");
      if (nodesData && nodesData?.length > 0) {
        setNodesData((prev) =>
          prev ? prev.filter((n) => n.droplet_id !== droplet_id) : []
        );
      }
    } else {
      toast.error("Failed to delete node");
    }
    setLoading(false);
    setNodeToDelete(null);
  };

  const onDeleteCluster = async () => {
    setLoading(true);
    setDeleteClusterDialog(false);

    // Service layer handles: billing close + DO droplet deletion + DB soft-delete
    const delCluster = await api.post(`/services/kubernetes/clusters/delete`, {
      cluster_id: clusterId,
    });
    const settledDeleteCluster = delCluster as typeof delCluster & {
      error?: unknown;
      data?: { message?: string };
    };

    if (settledDeleteCluster.error) {
      setLoading(false);
      return;
    }

    if (delCluster.status === 200) {
      toast.success("Cluster deleted successfully");
      router.push("/dashboard/services/kubernetes");
      return;
    }

    toast.error(settledDeleteCluster.data?.message || "Failed to delete cluster");
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
        alertedRef.current = true;
        const readyToastKey = `k8s-ready-toast:${clusterId}`;
        const alreadyShown =
          typeof window !== "undefined" &&
          window.localStorage.getItem(readyToastKey) === "1";

        if (!alreadyShown) {
          toast.success("Cluster is ready!");
          if (typeof window !== "undefined") {
            window.localStorage.setItem(readyToastKey, "1");
          }
        }
      }
    }
  }, [allDone, clusterId]);

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
  //         if (res.status === 200 && res?.data?.user) {
  //           const userId = res?.data?.user.id;
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
          if (res.status === 200 && res?.data?.cluster?.project_id) {
            setCurrentProjectId(res?.data?.cluster?.project_id ?? "");
            setSelectedProjectId(res?.data?.cluster?.project_id ?? "select");
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

  const clusterStatusLabel = clusterFailed
    ? "Failed"
    : ready
      ? "Ready"
      : "Provisioning";
  const statusMeta = clusterFailed
    ? { color: "#f87171", label: "Failed", pulse: false, spin: false }
    : ready
      ? { color: "#4ade80", label: "Ready", pulse: true, spin: false }
      : { color: "#fbbf24", label: clusterStatusLabel, pulse: false, spin: true };
  const totalNodes = nodesData?.length || 0;
  const cpuTotal = clusterData?.clusterInfo?.node_config?.cpu || 0;
  const ramTotal = clusterData?.clusterInfo?.node_config?.ram || 0;
  const storageTotal = clusterData?.clusterInfo?.node_config?.storage || 0;

  if (loading && !ready) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="h-8 w-48 animate-pulse bg-white/[0.04] rounded-[5px]" />
        <div className="h-16 w-2/3 animate-pulse bg-white/[0.04] rounded-[5px]" />
        <div className="h-24 animate-pulse border border-white/[0.06] bg-[#111216] rounded-[6px]" />
        <div className="h-64 animate-pulse border border-white/[0.06] bg-[#111216] rounded-[6px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-10">
        <div className="max-w-3xl min-w-0">
          <Link
            href="/dashboard/services/kubernetes"
            className={`${MONO} inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition-colors mb-5`}
          >
            <ArrowLeft className="h-3 w-3" />
            Back to clusters
          </Link>

          <div className={`${MONO} flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/40 mb-3`}>
            <span>Kubernetes</span>
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="text-white/65 truncate">{clusterId}</span>
          </div>

          <h1 className="text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
            {ready ? "Cluster" : "Provisioning"}{" "}
            <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
              {ready ? "operations" : "infrastructure"}
            </span>
          </h1>
          <p className={`${MONO} mt-3 max-w-2xl text-[11.5px] text-white/45 leading-relaxed`}>
            {ready
              ? "Review kubeconfig access, node capacity, monitoring, and project assignment from a single operator view."
              : "Validating control plane creation, node connectivity, and readiness checks before the cluster becomes available."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`${MONO} inline-flex items-center gap-1.5 h-10 px-3.5 border bg-[#111216] text-[11px] uppercase tracking-[0.14em] rounded-[5px]`}
            style={{ borderColor: `${statusMeta.color}33`, color: statusMeta.color }}
          >
            {statusMeta.spin ? (
              <Spinner />
            ) : (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: statusMeta.color, boxShadow: `0 0 6px ${statusMeta.color}` }}
              />
            )}
            {statusMeta.label}
          </span>
        </div>
      </header>

      {/* ── Stats strip ───────────────────────────────────── */}
      <section className="mb-12 border-y border-white/[0.06] grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]">
        <StatCell
          label="Nodes"
          value={String(totalNodes)}
          hint="control + workers"
          accent={ACCENT}
        />
        <StatCell
          label="vCPU"
          value={String(cpuTotal)}
          suffix="vCPU"
          hint="Total allocated"
          accent="#a78bfa"
        />
        <StatCell
          label="Memory"
          value={String(ramTotal)}
          suffix="MB"
          hint="Total RAM"
        />
        <StatCell
          label="Storage"
          value={String(storageTotal)}
          suffix="GB"
          hint="Total disk"
        />
      </section>

      {clusterFailed && (
        <section className="mb-10 border border-rose-500/25 bg-rose-500/[0.04] rounded-[6px] p-5 flex items-start gap-4">
          <div className="h-10 w-10 shrink-0 inline-flex items-center justify-center border border-rose-500/25 bg-rose-500/[0.08] rounded-[6px]">
            <AlertTriangle className="h-5 w-5 text-rose-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-rose-200">
              Cluster creation failed
            </h3>
            <p className={`${MONO} mt-1.5 text-[11.5px] text-white/55 leading-relaxed max-w-2xl`}>
              An error occurred during cluster creation. The droplets have been
              automatically cleaned up to prevent unnecessary charges. Please
              delete this failed cluster record and try creating a new cluster.
            </p>
            <button
              onClick={handleDeleteClusterClick}
              className={`${MONO} mt-4 h-10 inline-flex items-center gap-1.5 px-3.5 border border-rose-500/25 bg-rose-500/[0.06] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.10] rounded-[5px] transition-colors`}
            >
              <Trash2 className="h-3 w-3" />
              Delete failed cluster
            </button>
          </div>
        </section>
      )}

      {ready === false &&
        !clusterFailed &&
        (clusterLifecycleStatus === "pending" || clusterLifecycleStatus === "creating") && (
        <section className="mb-10">
          <SectionHead index="—" title="Provisioning" accent="progress" />
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-4">
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

            <div className="pt-3 border-t border-white/[0.04] flex items-center gap-2">
              {!allDone ? (
                <>
                  <Spinner />
                  <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                    Provisioning
                  </span>
                </>
              ) : (
                <span className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-emerald-300`}>
                  All steps complete
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {ready && (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          {/* ── Pill nav ─────────────────────────────────── */}
          <ServiceTabBar
            tabs={[
              { value: "cluster", label: "Cluster", icon: FolderOpen },
              { value: "insight", label: "Insight", icon: BarChart3 },
              { value: "settings", label: "Settings", icon: Settings },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            className="mb-10"
          />

          {/* ── CLUSTER TAB ────────────────────────────── */}
          <TabsContent value="cluster" className="mt-0 space-y-12">
            <section>
              <SectionHead index="01" title="Kube" accent="config" />
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 flex flex-wrap items-center justify-between gap-4">
                <p className={`${MONO} text-[11.5px] text-white/55 leading-relaxed max-w-xl`}>
                  This file contains credentials for accessing your cluster.
                  Store it securely and avoid committing it to version control.
                </p>
                <button
                  onClick={() => {
                    downloadKubeconfig(
                      clusterId,
                      clusterData?.clusterInfo?.kubeconfig || ""
                    );
                  }}
                  className={`${MONO} inline-flex h-10 items-center gap-1.5 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                  style={{
                    background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                    color: "#ffffff",
                    boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                  }}
                >
                  <Download className="h-3 w-3" />
                  Download kubeconfig
                </button>
              </div>
            </section>

            <section>
              <SectionHead
                index="02"
                title="The"
                accent="nodes"
                meta={`${nodesData?.length || 0} total`}
              />
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={`${MONO} text-left px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium`}>
                          Public IP
                        </th>
                        <th className={`${MONO} text-left px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium`}>
                          Role
                        </th>
                        <th className={`${MONO} text-left px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium`}>
                          Private IP
                        </th>
                        <th className={`${MONO} text-right px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium`}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {nodesData?.map((n, index) => (
                        <tr
                          key={index}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className={`${MONO} px-5 py-3 text-[12.5px] font-medium text-white tabular-nums`}>
                            {n.public_ip}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold`}
                              style={{ color: index === 0 ? ACCENT : "#a78bfa" }}
                            >
                              <span
                                className="h-1 w-1 rounded-full"
                                style={{
                                  background: index === 0 ? ACCENT : "#a78bfa",
                                  boxShadow: `0 0 5px ${index === 0 ? ACCENT : "#a78bfa"}`,
                                }}
                              />
                              {index === 0 ? "control-plane" : "worker"}
                            </span>
                          </td>
                          <td className={`${MONO} px-5 py-3 text-[12.5px] text-white/55 tabular-nums`}>
                            {n.private_ip}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() =>
                                handleDeleteNodeClick(n.droplet_id, index)
                              }
                              disabled={loading}
                              className={`${MONO} inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-rose-300/70 hover:text-rose-300 transition-colors disabled:opacity-50`}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* ── INSIGHT TAB ────────────────────────────── */}
          <TabsContent value="insight" className="mt-0 space-y-8">
            <section>
              <SectionHead index="01" title="Node" accent="monitoring" />
              <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <p className={`${MONO} text-[11.5px] text-white/55`}>
                  Real-time metrics for your cluster nodes.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={selectedNodeForInsight}
                    onValueChange={setSelectedNodeForInsight}
                  >
                    <SelectTrigger className={`${MONO} h-10 w-full sm:w-[220px] border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 rounded-[5px]`}>
                      <SelectValue placeholder="Select a node" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0e11] border-white/[0.08] text-white">
                      {nodesData?.map((node, index) => (
                        <SelectItem
                          key={node.droplet_id}
                          value={node.droplet_id}
                        >
                          {node.public_ip} ({index === 0 ? "control-plane" : "worker"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={String(insightTimeRange)}
                    onValueChange={(val) => setInsightTimeRange(Number(val))}
                  >
                    <SelectTrigger className={`${MONO} h-10 w-full sm:w-[160px] border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 rounded-[5px]`}>
                      <SelectValue placeholder="Time range" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0e11] border-white/[0.08] text-white">
                      <SelectItem value="1">Last 1 hour</SelectItem>
                      <SelectItem value="6">Last 6 hours</SelectItem>
                      <SelectItem value="12">Last 12 hours</SelectItem>
                      <SelectItem value="24">Last 24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {insightLoading ? (
                <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <Spinner />
                    <p className={`${MONO} text-[11px] text-white/55`}>
                      Loading monitoring data
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <GraphCard
                    title="CPU usage"
                    data={insightGraphsData.cpu}
                    color={ACCENT}
                  />
                  <GraphCard
                    title="Memory free"
                    data={insightGraphsData.memory}
                    color="#a78bfa"
                  />
                  <GraphCard
                    title="Disk free"
                    data={insightGraphsData.disk}
                    color="#22d3ee"
                  />
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── SETTINGS TAB ──────────────────────────── */}
          <TabsContent value="settings" className="mt-0 space-y-12">
            <section>
              <SectionHead index="01" title="Project" accent="assignment" />
              <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 space-y-4">
                <p className={`${MONO} text-[11.5px] text-white/55 leading-relaxed`}>
                  Assign this cluster to a different project.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={selectedProjectId}
                    onValueChange={setSelectedProjectId}
                  >
                    <SelectTrigger className={`${MONO} h-10 w-full sm:flex-1 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 rounded-[5px]`}>
                      <SelectValue
                        placeholder="Select a project"
                        className="text-white"
                      />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0e11] border-white/[0.08] text-white">
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
                    className={`${MONO} inline-flex h-10 items-center gap-1.5 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
                    style={{
                      background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                      color: "#ffffff",
                      boxShadow: "0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                  >
                    {loading ? <Spinner /> : <Check className="h-3 w-3" />}
                    Update
                  </button>
                </div>
              </div>
            </section>

            <section>
              <SectionHead index="02" title="Danger" accent="zone" />
              <div className="border border-rose-500/25 bg-rose-500/[0.03] rounded-[6px] p-5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 inline-flex items-center justify-center border border-rose-500/25 bg-rose-500/[0.08] rounded-[6px]">
                    <AlertTriangle className="h-4 w-4 text-rose-300" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-rose-200">
                      Delete this cluster
                    </h3>
                    <p className={`${MONO} mt-1.5 text-[11.5px] text-white/55 leading-relaxed max-w-2xl`}>
                      Deleting this cluster will permanently remove all nodes
                      and data. This action cannot be undone.
                    </p>
                    <button
                      onClick={handleDeleteClusterClick}
                      disabled={loading}
                      className={`${MONO} mt-4 h-10 inline-flex items-center gap-1.5 px-3.5 border border-rose-500/25 bg-rose-500/[0.06] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.10] rounded-[5px] transition-colors disabled:opacity-50`}
                    >
                      {loading ? <Spinner /> : <Trash2 className="h-3 w-3" />}
                      Delete cluster
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}

      {/* Delete Node Confirmation Dialog */}
      <AlertDialog open={deleteNodeDialog} onOpenChange={setDeleteNodeDialog}>
        <AlertDialogContent className="bg-[#0d0e11] border border-white/[0.08] rounded-[6px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-[16px] font-semibold">
              Delete node
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11.5px] text-white/55 leading-relaxed`}>
              Are you sure you want to delete this node? This action cannot be
              undone.
            </AlertDialogDescription>
            {nodeToDelete && (
              <div className={`${MONO} mt-3 border border-white/[0.06] bg-[#111216] rounded-[5px] px-3 py-2 text-[12px]`}>
                <span className="text-white/45 uppercase tracking-[0.1em] text-[10px]">Node IP </span>
                <span className="text-white tabular-nums ml-1">
                  {
                    nodesData?.find(
                      (n) => n.droplet_id === nodeToDelete.droplet_id
                    )?.public_ip
                  }
                </span>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={`${MONO} h-10 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px]`}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteNode}
              className={`${MONO} h-10 px-3.5 border border-rose-500/25 bg-rose-500/[0.08] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.15] rounded-[5px]`}
            >
              Delete node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Cluster Confirmation Dialog */}
      <AlertDialog
        open={deleteClusterDialog}
        onOpenChange={setDeleteClusterDialog}
      >
        <AlertDialogContent className="bg-[#0d0e11] border border-white/[0.08] rounded-[6px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-[16px] font-semibold">
              Delete cluster
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11.5px] text-white/55 leading-relaxed`}>
              Are you sure you want to delete this entire cluster? This will
              permanently remove:
            </AlertDialogDescription>
            <ul className={`${MONO} mt-3 ml-4 list-disc text-[11.5px] text-white/55 space-y-1`}>
              <li>
                All {nodesData?.length || 0} nodes (control plane and workers)
              </li>
              <li>All cluster data and configurations</li>
              <li>All associated resources</li>
              <li>This action cannot be undone</li>
            </ul>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={`${MONO} h-10 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px]`}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteCluster}
              className={`${MONO} h-10 px-3.5 border border-rose-500/25 bg-rose-500/[0.08] text-[11px] uppercase tracking-[0.14em] text-rose-300 hover:bg-rose-500/[0.15] rounded-[5px]`}
            >
              Delete cluster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── UI helpers ────────────────────────────────────────────────

function SectionHead({
  index,
  title,
  accent,
  meta,
}: {
  index: string;
  title: string;
  accent: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-3">
        <span className={`${MONO} text-[10.5px] tabular-nums text-white/35`}>{index}</span>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-white">
          {title}{" "}
          <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">
            {accent}
          </span>
        </h2>
      </div>
      {meta && (
        <span className={`${MONO} text-[11px] text-white/45 tabular-nums`}>{meta}</span>
      )}
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
  hint?: string;
  accent?: string;
}) {
  const dotColor = accent ?? "rgba(255,255,255,0.35)";
  return (
    <div className="px-5 py-5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: dotColor,
            boxShadow: accent ? `0 0 6px ${dotColor}` : "none",
          }}
        />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          style={SERIF_STYLE}
          className="text-[28px] sm:text-[34px] leading-none font-bold tabular-nums tracking-[-0.03em] text-white"
        >
          {value}
        </span>
        {suffix && (
          <span
            style={SERIF_STYLE}
            className="text-[14px] text-white/45 font-medium"
          >
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className={`${MONO} text-[10.5px] text-white/40 mt-auto truncate`}>{hint}</p>
      )}
    </div>
  );
}

function StepRow({
  label,
  done,
  inProgress,
}: {
  label: string;
  done: boolean;
  inProgress: boolean;
}) {
  const dotColor = done ? "#4ade80" : inProgress ? ACCENT : "rgba(255,255,255,0.25)";
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full transition-colors"
        style={{
          background: done ? `${dotColor}22` : inProgress ? `${dotColor}1f` : "transparent",
          border: `1px solid ${done ? `${dotColor}55` : inProgress ? `${dotColor}55` : "rgba(255,255,255,0.12)"}`,
          color: dotColor,
        }}
      >
        {done && <Check className="h-3 w-3" />}
        {inProgress && <Spinner />}
      </div>
      <span
        className={`${MONO} text-[12px] uppercase tracking-[0.08em] transition-colors ${
          done ? "text-white" : inProgress ? "text-white" : "text-white/45"
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
      className="h-3 w-3 animate-spin"
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
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
        <h4 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/55 mb-4`}>
          {title}
        </h4>
        <div className="flex items-center justify-center h-[280px]">
          <p className={`${MONO} text-[11px] text-white/40`}>No data available</p>
        </div>
      </div>
    );
  }

  const chartData = data.labels.map((label, index) => {
    const point: Record<string, string | number> = { time: label };
    data.datasets.forEach((dataset) => {
      point[dataset.label] = dataset.data[index] || 0;
    });
    return point;
  });

  const mainDataset = data.datasets[0];
  const values = mainDataset.data;
  const latest = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
          />
          <h4 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/65 font-semibold`}>
            {title}
          </h4>
        </div>
        <div className={`${MONO} flex items-center gap-4 text-[10.5px] tabular-nums`}>
          <div>
            <span className="text-white/40 uppercase tracking-[0.1em]">Current </span>
            <span className="text-white font-semibold ml-1">{latest.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-white/40 uppercase tracking-[0.1em]">Avg </span>
            <span className="text-white font-semibold ml-1">{avg.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="h-[280px] md:h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={50}
              stroke="rgba(255,255,255,0.08)"
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
              width={50}
              domain={["auto", "auto"]}
              stroke="rgba(255,255,255,0.08)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0d0e11",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "5px",
                fontSize: "11px",
              }}
              labelStyle={{ color: "rgba(255,255,255,0.65)" }}
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

      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/[0.04]">
        <div className={`${MONO} text-[10.5px] tabular-nums`}>
          <span className="text-white/40 uppercase tracking-[0.1em]">Min </span>
          <span className="text-emerald-300 font-semibold ml-1">{min.toFixed(2)}</span>
        </div>
        <div className={`${MONO} text-[10.5px] text-right tabular-nums`}>
          <span className="text-white/40 uppercase tracking-[0.1em]">Max </span>
          <span className="text-rose-300 font-semibold ml-1">{max.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default SingleCluster;
