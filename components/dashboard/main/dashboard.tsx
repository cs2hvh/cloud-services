'use client';

// import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { 
  Server, 
  Database, 
  // Globe, 
  Activity,
  // ArrowUp,
  MoreVertical,
  Plus,
  ShieldCheck,
  HardDrive,
  Eye,
  Archive,
  Shield,

} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// import { createClient } from "@/lib/supabase/client";
import { ObjectSpaceBucket, Tables } from "@/lib/supabase/types";
import { KubernetesIcon } from "@/components/ui/kubernetes";
import { DatabaseIcon } from "../database/database-icon";
import { dbLocations } from "@/config/locations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// import { object } from "zod";

interface PageProps {
    game_servers: Tables<"game_servers">[];
    database_clusters: Tables<"database_clusters">[];
    kubernetes_clusters: Tables<"clusters_get">[];
    spectrum_apps: Tables<"spectrum_apps">[];
    object_storage:ObjectSpaceBucket[];
    project_logs:Tables<"project_logs">[];
}

// A simple bar chart component
const BarChart = ({ data, colors }: { data: { name: string, value: number }[], colors: string[] }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  return (
    <div className="w-full p-4">
      <div className="flex justify-around items-end space-x-4 h-48">
        {data.map((d, i) => (
          <div key={d.name} className="flex-1 flex flex-col items-center h-full justify-end">
            <div className="w-full flex flex-col items-center justify-end h-full">
              <div 
                className="w-full rounded-t-md transition-all duration-300 min-h-[4px]"
                style={{ 
                  height: `${(d.value / maxValue) * 100}%`, 
                  backgroundColor: colors[i % colors.length]
                }}
              ></div>
            </div>
            <div className="mt-2 text-center">
              <span className="text-xs text-white/70 block">{d.name}</span>
              <span className="text-xs text-white/50 block">{d.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Dashboard = ({
  data
}: {
  data: PageProps;
}) => {
  const router = useRouter();
  
  // Calculate metrics from actual data
  const activeGameServers = data.game_servers.filter(s => s.status === 'active').length;
  const onlineDatabases = data.database_clusters.filter(db => db.status === 'online').length;
  const readyK8sClusters = data.kubernetes_clusters.filter(k8s => k8s.status === 'ready').length;
  const spectrum_apps = data.spectrum_apps.filter(app => app.status === 'updated'||'created').length;
  const object_storage = data.object_storage.filter(object=>object.status==='active').length;

  const stats = [
    {
      title: "Game Servers",
      value: data.game_servers.length.toString(),
      icon: Server,
      color: "bg-gradient-to-br from-blue-500 to-purple-600",
    },
    {
      title: "Kubernetes",
      value: data.kubernetes_clusters.length.toString(),
      icon: KubernetesIcon,
      color: "bg-gradient-to-br from-purple-500 to-blue-500",
    },
    {
      title: "Databases",
      value: data.database_clusters.length.toString(),
      icon: Database,
      color: "bg-gradient-to-br from-blue-600 to-purple-500",
    },
    {
      title: "Active Services",
      value: (activeGameServers + onlineDatabases + readyK8sClusters+ spectrum_apps + object_storage).toString(),
      icon: ShieldCheck,
      color: "bg-gradient-to-br from-purple-600 to-blue-600",
    },
    {
      title: "Spectrum Apps",
      value: data.spectrum_apps.length.toString(),
      icon: Shield,
      color: "bg-gradient-to-br from-purple-600 to-blue-600",
    },
    {
      title: "Object Storage",
        value: data.object_storage.length.toString(),
      icon: Archive,
      color: "bg-gradient-to-br from-purple-600 to-blue-600",
    },
  ];

  // Generate activities from actual resources
  // const generateActivities = () => {
  //   const activities: Array<{ id: string; action: string; type: string; time: string }> = [];

  //   // Add game server activities
  //   data.game_servers.slice(0, 3).forEach((server) => {
  //     activities.push({
  //       id: `game-${server.id}`,
  //       action: `Game server "${server.name}" is ${server.status}`,
  //       type: `${server.game_type}`,
  //       time: server.created_at ? formatTimeAgo(new Date(server.created_at)) : "Recently",
  //     });
  //   });

  //   // Add database activities
  //   data.database_clusters.slice(0, 2).forEach((db, idx) => {
  //     activities.push({
  //       id: `db-${db.id || idx}`,
  //       action: `Database cluster "${db.name}" is ${db.status}`,
  //       type: db.engine,
  //       time: "Recently",
  //     });
  //   });

  //   // Add kubernetes activities
  //   data.kubernetes_clusters.slice(0, 2).forEach((k8s) => {
  //     activities.push({
  //       id: `k8s-${k8s.cluster_id}`,
  //       action: `Kubernetes cluster "${k8s.cluster_name}" is ${k8s.status}`,
  //       type: "Kubernetes",
  //       time: "Recently",
  //     });
  //   });

  //   // Sort and return top 5
  //   return activities.slice(0, 5);
  // };

  // Helper function to format time ago
  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  

  const chartData = [
    { name: 'Game', value: data.game_servers.length },
    { name: 'DB', value: data.database_clusters.length },
    { name: 'K8s', value: data.kubernetes_clusters.length },
    { name: 'Bucket', value: object_storage  },
    { name: 'Network-ddos', value: spectrum_apps },
    { name: 'Active', value: activeGameServers + onlineDatabases + readyK8sClusters+spectrum_apps+object_storage },
  ];

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-white/60">An overview of your cloud empire.</p>
          </div>
          <Link
            href="/dashboard/projects/new"
            className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
          >
            <Plus className="-ml-1 mr-2 h-5 w-5" />
            New Project
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`${stat.color} p-6 rounded-lg shadow-lg`}
            >
              <div className="flex items-center justify-between">
                <p className="text-white/80 font-medium">{stat.title}</p>
                <stat.icon className="w-6 h-6 text-white/70" />
              </div>
              <p className="text-3xl font-bold mt-2">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-3 bg-white/5 p-6 rounded-lg"
          >
            <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
            <div className="space-y-4">
              {data.project_logs?.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-3">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <div>
                      <p>{activity.event}</p>
                      <p className="text-xs text-white/50">{activity.text}</p>
                    </div>
                  </div>
                  <span className="text-white/50">{formatTimeAgo(new Date(activity?.created_at||""))}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="lg:col-span-2 bg-white/5 p-6 rounded-lg"
          >
            <h2 className="text-xl font-semibold mb-4">Services Overview</h2>
            <BarChart data={chartData} colors={['#3b82f6', '#8b5cf6']} />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 bg-white/5 p-6 rounded-lg"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Game Servers</h2>
            <Link href="/dashboard/services/game" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View all
            </Link>
          </div>
          {data.game_servers.length > 0 ? (
            <div className="flow-root">
              <div className="-mx-6 -my-2 overflow-x-auto">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full">
                    <thead className="text-white/70 text-sm">
                      <tr>
                        <th scope="col" className="py-3.5 pl-6 pr-3 text-left font-semibold">Server Name</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">Type</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">Status</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-6">
                          <span className="sr-only">Edit</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {data.game_servers.map((server) => (
                        <tr key={server.id}>
                          <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium">{server.name}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white/70">{server.game_type}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${server.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                              {server.status}
                            </span>
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                            <button className="hover:text-blue-400"><MoreVertical className="w-5 h-5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-lg">
              <HardDrive className="mx-auto h-12 w-12 text-white/30" />
              <h3 className="mt-2 text-sm font-semibold">No game servers</h3>
              <p className="mt-1 text-sm text-white/50">Get started by deploying a new game server.</p>
              <div className="mt-6">
                <Link href="/dashboard/services/game/new" className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200">
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  New Server
                </Link>
              </div>
            </div>
          )}
        </motion.div>

         <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 bg-white/5 p-6 rounded-lg"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Database Clusters</h2>
            <Link href="/dashboard/services/database" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View all
            </Link>
          </div>
          {data.database_clusters.length > 0 ? (
            <div className="flow-root">
              <div className="-mx-6 -my-2 overflow-x-auto">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full">
                    <thead className="text-white/70 text-sm">
                      <tr>
                        <th scope="col" className="py-3.5 pl-6 pr-3 text-left font-semibold">Server Name</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">DB Icon</th>
                         <th scope="col" className="px-3 py-3.5 text-left font-semibold">Location</th>
                          <th scope="col" className="px-3 py-3.5 text-left font-semibold">Version</th>
                          
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">Status</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-6">
                          <span className="sr-only">Edit</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {data.database_clusters.map((server) => (
                        <tr key={server.id}>
                          <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium">{server.name}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white/70">
                           <DatabaseIcon engine={server.engine} className="h-8 w-8" />

                          </td>
                          <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium">{dbLocations.find(location => location.short === server.region)?.city}</td>
                           <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium">{server.version}</td>
                           
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${server.status === 'online' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                              {server.status}
                            </span>
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="hover:text-blue-400 transition-colors">
                                  <MoreVertical className="w-5 h-5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => router.push(`/dashboard/services/database/clusters/${server.cluster_id}`)}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <Eye className="w-4 h-4" />
                                  View
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-lg">
              <HardDrive className="mx-auto h-12 w-12 text-white/30" />
              <h3 className="mt-2 text-sm font-semibold">No database clusters</h3>
              <p className="mt-1 text-sm text-white/50">Get started by creating a database cluster.</p>
              <div className="mt-6">
                <Link href="/dashboard/database" className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200">
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  New Cluster
                </Link>
              </div>
            </div>
          )}
        </motion.div>

         <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 bg-white/5 p-6 rounded-lg"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Kubernetes Clusters</h2>
            <Link href="/dashboard/services/kubernetes" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View all
            </Link>
          </div>
          {data.kubernetes_clusters.length > 0 ? (
            <div className="flow-root">
              <div className="-mx-6 -my-2 overflow-x-auto">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full">
                    <thead className="text-white/70 text-sm">
                      <tr>
                        <th scope="col" className="py-3.5 pl-6 pr-3 text-left font-semibold">Server Name</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">CNI plugin</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">Version</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">Nodes</th>
                        <th scope="col" className="px-3 py-3.5 text-left font-semibold">Status</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-6">
                          <span className="sr-only">Edit</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {data.kubernetes_clusters.map((server) => (
                        <tr key={server.cluster_id}>
                          <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium">{server.cluster_name}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white/70">{server.cni_plugin}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">{server.k8s_version}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">{server.workers?.length}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${server.status === 'ready' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                              {server.status}
                            </span>
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium">
                            <button className="hover:text-blue-400"><MoreVertical className="w-5 h-5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-lg">
              <HardDrive className="mx-auto h-12 w-12 text-white/30" />
              <h3 className="mt-2 text-sm font-semibold">No Kubernetes clusters</h3>
              <p className="mt-1 text-sm text-white/50">Get started by creating a Kubernetes cluster.</p>
              <div className="mt-6">
                <Link href="/dashboard/kubernetes/new" className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200">
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  New Cluster
                </Link>
              </div>
            </div>
          )}
        </motion.div>
    </div>
  );
};

export default Dashboard;