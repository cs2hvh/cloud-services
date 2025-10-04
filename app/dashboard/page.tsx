'use client';

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { 
  Server, 
  Database, 
  Globe, 
  Activity,
  // ArrowUp,
  MoreVertical,
  Plus,
  ShieldCheck,
  HardDrive
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// A simple bar chart component
const BarChart = ({ data, colors }: { data: { name: string, value: number }[], colors: string[] }) => {
  const maxValue = Math.max(...data.map(d => d.value));
  return (
    <div className="w-full h-48 flex justify-around items-end space-x-2 p-4">
      {data.map((d, i) => (
        <div key={d.name} className="flex-1 flex flex-col items-center">
          <div 
            className="w-full rounded-t-md transition-all duration-300"
            style={{ 
              height: `${(d.value / maxValue) * 100}%`, 
              backgroundColor: colors[i % colors.length]
            }}
          ></div>
          <span className="text-xs text-white/70 mt-2">{d.name}</span>
        </div>
      ))}
    </div>
  );
};

const DashboardPage = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [gameServers, setGameServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: projectsData } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        const { data: serversData } = await supabase
          .from("game_servers")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        setProjects(projectsData || []);
        setGameServers(serversData || []);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  const activeServers = gameServers.filter(s => s.status === 'active').length;

  const stats = [
    {
      title: "Active Services",
      value: activeServers.toString(),
      icon: Server,
      color: "bg-gradient-to-br from-blue-500 to-purple-600",
    },
    {
      title: "Total Projects",
      value: projects.length.toString(),
      icon: Globe,
      color: "bg-gradient-to-br from-purple-500 to-blue-500",
    },
    {
      title: "Databases",
      value: "3", // Dummy data
      icon: Database,
      color: "bg-gradient-to-br from-blue-600 to-purple-500",
    },
    {
      title: "Security Status",
      value: "Protected",
      icon: ShieldCheck,
      color: "bg-gradient-to-br from-purple-600 to-blue-600",
    },
  ];

  const activities = [
    { id: 1, action: "New server deployed", project: "alpha-prod", time: "3m ago" },
    { id: 2, action: "Database backup successful", project: "main-db", time: "25m ago" },
    { id: 3, action: "Project 'gamma' created", project: "gamma", time: "1h ago" },
    { id: 4, action: "User 'admin' logged in", project: "system", time: "2h ago" },
  ];

  const chartData = [
    { name: 'VPS', value: 4 },
    { name: 'DB', value: 3 },
    { name: 'K8s', value: 2 },
    { name: 'Game', value: activeServers },
  ];

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
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
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-3">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <div>
                      <p>{activity.action}</p>
                      <p className="text-xs text-white/50">Project: {activity.project}</p>
                    </div>
                  </div>
                  <span className="text-white/50">{activity.time}</span>
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
            <h2 className="text-xl font-semibold">Active Servers</h2>
            <Link href="/dashboard/services/game" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View all
            </Link>
          </div>
          {gameServers.length > 0 ? (
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
                      {gameServers.map((server) => (
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
              <h3 className="mt-2 text-sm font-semibold">No active servers</h3>
              <p className="mt-1 text-sm text-white/50">Get started by deploying a new server.</p>
              <div className="mt-6">
                <Link href="/dashboard/services/game/new" className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200">
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  New Server
                </Link>
              </div>
            </div>
          )}
        </motion.div>
    </div>
  );
};

export default DashboardPage;