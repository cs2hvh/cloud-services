"use client";
import api from "@/lib/axios/axios";
import { Json } from "@/lib/supabase/types";
import { Cpu, Download, HardDrive, MemoryStick, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Graph from "./graph";

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

function SingleCluster({ clusterId }: { clusterId: string }) {
  //console.log(clusterId,".............clusterId in single cluster...........");
  const [status, setStatus] = useState<CheckStatus>({
    createStatus: false,
    connectStatus: false,
    verifyStatus: false,
  });

  const [clusterData, setClusterData] = useState<CheckStatus | null>(null);
  const [nodesData, setNodesData] = useState<NodeInfo | null>(null);
  // const router=useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const alertedRef = useRef(false);

  let x = 10;
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
    setError(null);
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
        setError(err?.message || "Something went wrong while submitting.");
      } else {
        setError("Something went wrong while submitting.");
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

      // Ensure the data is stringified as JSON
      const jsonString = JSON.stringify(data.data, null, 2); // nicely formatted JSON

      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${clusterId}.json`; // Change extension to .json
      a.click();

      // Optional: revoke the URL after some time
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      console.error("Failed to download kubeconfig");
    }
  };

  const onDeleteNode = async (droplet_id: string, index: number) => {

  debugger

    if(index===0){
      toast.error("You cannot delete control plane node");
      return;
    }
    const res = await api.post(
      `/services/kubernetes/manageip/delete`,
      {
        droplet_id: droplet_id,
      }
    );

    if (res.status === 200) {
      // Handle successful deletion
      if (nodesData && nodesData?.length > 0) {
        setNodesData((prev) =>
          prev ? prev.filter((n) => n.droplet_id !== droplet_id) : []
        );
      }
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
        const check = searchParams.get("clusterStatus");
        if (searchParams.get("clusterStatus") != "ready") {
          alert("Cluster is ready!");
        }
      }
    }
  }, [allDone]);

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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold text-slate-900 mb-1">
          Getting Started with Kubernetes
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          Cluster: <span className="font-mono">{clusterId}</span>
        </p>

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-6 md:p-8 space-y-5">
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

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <div className="flex items-center gap-2">
              {!allDone ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  <span>Checking status every 1 minute…</span>
                </span>
              ) : (
                <span className="text-emerald-600 font-medium">
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

          {/* {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )} */}
        </div>

        <section className="rounded-2xl my-2 bg-white shadow-sm ring-1 ring-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">
              Kubeconfig
            </h3>
            <button
              onClick={() => {
                downloadKubeconfig(
                  clusterId,
                  clusterData?.clusterInfo?.kubeconfig || ""
                );
              }}
              //disabled={downloading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <Download className="h-4 w-4" />{" "}
              {/* {downloading ? "Preparing…" : "Download kubeconfig"} */}
            </button>
          </div>
          <p className="text-sm text-slate-500">
            This file contains credentials for accessing your cluster. Store it
            securely and avoid committing it to version control.
          </p>
        </section>
        <section className="rounded-2xl my-2 bg-white shadow-sm ring-1 ring-slate-200 p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-800">
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
        </section>
        <section className="rounded-2xl my-2 bg-white shadow-sm ring-1 ring-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Nodes</h3>
            <div className="text-xs text-slate-500">{3} total</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4">public_ip</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">private_ip</th>
                  <th className="py-2 pr-4">CPU</th>
                  <th className="py-2 pr-4">Memory</th>
                  <th className="py-2 pr-4">Disk</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nodesData?.map((n, index) => (
                  <tr key={index}>
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      {n.public_ip}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {index === 0 ? "control-plane" : "worker"}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 ">{n.private_ip}</td>
                    <td className={`py-2 pr-4 font-semibold `}>
                      <button
                        onClick={() => setGraphOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-2 border-green-400 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                      >
                        View insight
                      </button>
                    </td>
                    <td className={`py-2 pr-4 font-semibold`}>
                      <button
                         onClick={() => setGraphOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-2 border-green-400 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                      >
                        View insight
                      </button>
                    </td>
                    <td className={`py-2 pr-4 font-semibold `}>
                      <button
                        onClick={() => setGraphOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-2 border-green-400 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                      >
                        View insight
                      </button>
                    </td>
                    <td className="py-2 pr-0 text-right">
                      <button
                        onClick={() => onDeleteNode(n.droplet_id,index)}
                        className="inline-flex items-center gap-1 rounded-lg text-red-400 border border-2 border-red-400 px-2.5 py-1.5 text-xs  hover:bg-green-50 hover:text-red-700 hover:border-green-200"
                      >
                        <Trash2 className="h-3.5 w-3.5  text-red-400" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {x === 0 && (
                  <tr>
                    <td className="py-6 text-center text-slate-400" colSpan={7}>
                      No nodes yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {
        graphOpen && <Graph open={graphOpen}  setGraphOpen={setGraphOpen} />
      }
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
      <StatusDot done={done} inProgress={inProgress} />
      <div
        className={`text-sm md:text-base ${done ? "text-slate-900" : "text-slate-700"}`}
      >
        {label}
      </div>
    </div>
  );
}

function StatusDot({
  done,
  inProgress,
}: {
  done: boolean;
  inProgress: boolean;
}) {
  if (done) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500"
        aria-label="done"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            d="M5 10.5l3 3 7-7"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (inProgress) {
    return (
      <span
        className="inline-flex h-6 w-6 rounded-full bg-blue-500"
        aria-label="in progress"
        title="in progress"
      />
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 rounded-full ring-2 ring-slate-300 bg-white"
      aria-label="pending"
      title="pending"
    />
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
  icon: any;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="rounded-xl bg-slate-100 p-3">
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-800">{value}</div>
        {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export default SingleCluster;
