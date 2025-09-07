"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { 
  Server, 
  Database, 
  Globe, 
  Activity,
  TrendingUp,
  Users,
  Clock,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  Plus
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const DashboardPage = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [gameServers, setGameServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user's projects
        const { data: projectsData } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        // Fetch user's game servers
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

  // Stats data
  const stats = [
    {
      title: "Active Servers",
      value: gameServers.filter(s => s.status === "active").length.toString(),
      change: "+12%",
      trend: "up",
      icon: Server,
      color: "from-blue-500 to-blue-600",
    },
    {
      title: "Total Projects",
      value: projects.length.toString(),
      change: "+8%",
      trend: "up",
      icon: Globe,
      color: "from-purple-500 to-purple-600",
    },
    {
      title: "Database Usage",
      value: "2.4 GB",
      change: "+18%",
      trend: "up",
      icon: Database,
      color: "from-green-500 to-green-600",
    },
    {
      title: "API Calls",
      value: "142K",
      change: "-5%",
      trend: "down",
      icon: Activity,
      color: "from-orange-500 to-orange-600",
    },
  ];

  // Recent activity data
  const activities = [
    { id: 1, action: "Server deployed", project: "minecraft-prod", time: "2 minutes ago", status: "success" },
    { id: 2, action: "Database backup", project: "webapp-db", time: "15 minutes ago", status: "success" },
    { id: 3, action: "Build failed", project: "api-gateway", time: "1 hour ago", status: "error" },
    { id: 4, action: "SSL renewed", project: "frontend-app", time: "3 hours ago", status: "success" },
    { id: 5, action: "Server restarted", project: "game-server-01", time: "5 hours ago", status: "warning" },
  ];

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black min-h-screen p-8">
        {/* Header */}
        <div className="mb-8">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold text-white mb-2"
          >
            Dashboard
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-400"
          >
            Welcome back! Here's an overview of your cloud infrastructure.
          </motion.p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-white/[0.05] rounded-xl blur-xl group-hover:from-white/[0.05] group-hover:to-white/[0.08] transition-all duration-300"></div>
              <div className="relative bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg bg-gradient-to-r ${stat.color} bg-opacity-10`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className={`flex items-center text-xs font-medium ${
                    stat.trend === "up" ? "text-green-400" : "text-red-400"
                  }`}>
                    {stat.trend === "up" ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
                    {stat.change}
                  </div>
                </div>
                <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-gray-400">{stat.title}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2"
          >
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
                <button className="text-gray-400 hover:text-white transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {activities.map((activity, index) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${
                        activity.status === "success" ? "bg-green-400" : 
                        activity.status === "error" ? "bg-red-400" : "bg-yellow-400"
                      }`}></div>
                      <div>
                        <p className="text-white text-sm font-medium">{activity.action}</p>
                        <p className="text-gray-500 text-xs">{activity.project}</p>
                      </div>
                    </div>
                    <span className="text-gray-400 text-xs">{activity.time}</span>
                  </motion.div>
                ))}
              </div>
              <Link 
                href="/dashboard/activity" 
                className="mt-4 inline-flex items-center text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              >
                View all activity →
              </Link>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6">Quick Actions</h2>
              <div className="space-y-3">
                <Link
                  href="/dashboard/services/game/new"
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div className="flex items-center space-x-3">
                    <Server className="w-5 h-5 text-blue-400" />
                    <span className="text-white text-sm font-medium">Deploy Game Server</span>
                  </div>
                  <Plus className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </Link>
                <Link
                  href="/dashboard/services/database/new"
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div className="flex items-center space-x-3">
                    <Database className="w-5 h-5 text-green-400" />
                    <span className="text-white text-sm font-medium">Create Database</span>
                  </div>
                  <Plus className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </Link>
                <Link
                  href="/dashboard/projects/new"
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div className="flex items-center space-x-3">
                    <Globe className="w-5 h-5 text-purple-400" />
                    <span className="text-white text-sm font-medium">New Project</span>
                  </div>
                  <Plus className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Resources Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8"
        >
          {/* Active Servers */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Active Servers</h2>
              <Link href="/dashboard/services/game" className="text-blue-400 hover:text-blue-300 text-sm">
                View all →
              </Link>
            </div>
            {gameServers.length > 0 ? (
              <div className="space-y-3">
                {gameServers.slice(0, 3).map((server) => (
                  <div key={server.id} className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Server className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{server.name}</p>
                        <p className="text-gray-500 text-xs">{server.game_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        server.status === "active" 
                          ? "bg-green-500/10 text-green-400" 
                          : "bg-gray-500/10 text-gray-400"
                      }`}>
                        {server.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Server className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No active servers</p>
                <Link
                  href="/dashboard/services/game/new"
                  className="mt-3 inline-flex items-center text-blue-400 hover:text-blue-300 text-sm"
                >
                  Deploy your first server →
                </Link>
              </div>
            )}
          </div>

          {/* Recent Projects */}
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Recent Projects</h2>
              <Link href="/dashboard/projects" className="text-blue-400 hover:text-blue-300 text-sm">
                View all →
              </Link>
            </div>
            {projects.length > 0 ? (
              <div className="space-y-3">
                {projects.slice(0, 3).map((project) => (
                  <Link
                    key={project.id}
                    href={`/dashboard/projects/${project.id}`}
                    className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                        <Globe className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{project.name}</p>
                        <p className="text-gray-500 text-xs">{project.description || "No description"}</p>
                      </div>
                    </div>
                    <Clock className="w-4 h-4 text-gray-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Globe className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No projects yet</p>
                <Link
                  href="/dashboard/projects/new"
                  className="mt-3 inline-flex items-center text-blue-400 hover:text-blue-300 text-sm"
                >
                  Create your first project →
                </Link>
              </div>
            )}
          </div>
        </motion.div>

        {/* System Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mt-8 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <div>
                <p className="text-white font-medium">All Systems Operational</p>
                <p className="text-gray-400 text-sm">Last checked 2 minutes ago</p>
              </div>
            </div>
            <Link
              href="/status"
              className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              View Status Page →
            </Link>
          </div>
        </motion.div>
    </div>
  );
};

export default DashboardPage;