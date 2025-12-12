"use client";

import { motion } from "motion/react";
import { Database, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { DatabaseIcon } from "@/components/dashboard/database/database-icon";
import { serviceLocations, vmLocations } from "@/config/locations";
import { useSession } from "@/app/dashboard/provider";

type DbCluster = {
  id: string;
  name: string;
  engine: string;
  status: string;
  num_nodes: number;
  created_at: string; // ISO
  version: string;
  cluster_id: string;
  region: string;
};

// Helper function to get location name from region code
const getLocationName = (regionCode: string): string => {
  // Combine both location arrays
  const allLocations = [...serviceLocations, ...vmLocations];
  
  // Find location by matching the region code with the short code
  const location = allLocations.find(
    (loc) => loc.short.toLowerCase() === regionCode.toLowerCase()
  );
  
  if (location) {
    return `${location.city}`;
  }
  
  // If not found, return the region code in a more readable format
  return regionCode || "Unknown";
};

const DatabasePage = () => {
 
  const user = useSession();
  const router = useRouter();

  if (!user) {
    router.push("/login");
    toast.error("You must be logged in to access the dashboard.");
  }

  const [clusters, setClusters] = useState([] as DbCluster[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    //fetch clusters from backend.
    async function fetchClusters() {
      try {
        //debugger;
        setLoading(true);
        const res = await api.post("/services/database/read_all_owner", {
          id: user?.user?.id,
        });
        if (res.status === 200) {
          setClusters(
            // res.data.data.filter((item: DbCluster) => item.status === "online")
            res.data.data
          );
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading database cluster...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Databases</h1>
          <p className="text-white/60">
            Manage and provision your database clusters.
          </p>
        </div>
        <Link
          href="/dashboard/services/database/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          New Database
        </Link>
      </motion.div>

      {clusters.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-slate-1000 ring-1 ring-slate-700 shadow-lg text-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-neutral-800/50 border-b border-neutral-800">
                <tr>
                   <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Cluster Name</th>
                   <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Engine</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Location</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Version</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {clusters.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-neutral-800/30 transition-colors"
                  >
                    <Td>
                      <div className="font-medium text-white">{c.name}</div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        {c.id}
                      </div>
                    </Td>
                    <Td>
                      <DatabaseIcon engine={c.engine} className="h-8 w-8" />
                    </Td>

                    <Td>
                      <span className="text-slate-300">
                        {getLocationName(c.region)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-col leading-tight text-xs text-slate-300">
                        <time
                          dateTime={c.created_at}
                          className="font-medium text-slate-100"
                          title={new Date(c.created_at).toLocaleString()}
                        >
                          {new Date(c.created_at).toLocaleDateString(
                            undefined,
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </time>
                        <span className="text-slate-400 text-[11px]">
                          {new Date(c.created_at).toLocaleTimeString(
                            undefined,
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                    </Td>

                    <Td>
                      <span className="text-slate-300">{c.version}</span>
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          c.status === "online"
                            ? "bg-green-500/20 text-green-400"
                            : c.status === "creating"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : c.status === "migrating"
                                ? "bg-orange-500/20 text-orange-400"
                                : c.status === "failed"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-slate-500/20 text-slate-400"
                        }`}
                      >
                        {c.status}
                      </span>
                    </Td>

                    <Td>
                      <Link
                          href={{
                            pathname: `/dashboard/services/database/clusters/${encodeURIComponent(c.cluster_id)}`,
                            query: { clusterStatus: c.status },
                          }}
                          className="
                            inline-flex items-center justify-center
                            rounded-md border border-blue-500
                            px-3 py-1.5 text-sm font-medium
                            text-blue-400
                            hover:bg-blue-500/15 hover:text-blue-300
                            active:scale-[0.97]
                            transition-all duration-200
                            w-full sm:w-auto
                          "
                        >
                          View Cluster
                        </Link>
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
          <Database className="mx-auto h-16 w-16 text-white/20" />
          <h3 className="mt-4 text-xl font-semibold">No Databases Found</h3>
          <p className="mt-2 text-sm text-white/50">
            Get started by provisioning a new database cluster.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard/services/database/new"
              className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Create Database
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};


function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-6 py-4 text-sm text-slate-800 align-middle">
      {children}
    </td>
  );
}

export default DatabasePage;
