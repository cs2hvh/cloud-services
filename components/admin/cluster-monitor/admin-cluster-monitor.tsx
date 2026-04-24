"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Activity, Server, Bell, LayoutGrid, Rocket } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ClusterUsageTab from "@/components/admin/cluster-monitor/cluster-usage-tab";
import DeploymentHealthTab from "@/components/admin/cluster-monitor/deployment-health-tab";
import ClusterEventsTab from "@/components/admin/cluster-monitor/cluster-events-tab";
import PlatformAppsTab from "@/components/admin/cluster-monitor/platform-apps-tab";

export default function AdminClusterMonitor() {
  const [activeTab, setActiveTab] = useState("cluster-usage");

  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <LayoutGrid className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Cluster Monitor</h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                Node health, deployment status &amp; warning events
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="cluster-usage"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Server className="h-4 w-4 mr-2" />
              Cluster Usage
            </TabsTrigger>
            <TabsTrigger
              value="deployment-health"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Activity className="h-4 w-4 mr-2" />
              Deployment Health
            </TabsTrigger>
            <TabsTrigger
              value="cluster-events"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Bell className="h-4 w-4 mr-2" />
              Cluster Events
            </TabsTrigger>
            <TabsTrigger
              value="platform-apps"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Platform Apps
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cluster-usage" className="mt-0">
            <ClusterUsageTab />
          </TabsContent>

          <TabsContent value="deployment-health" className="mt-0">
            <DeploymentHealthTab />
          </TabsContent>

          <TabsContent value="cluster-events" className="mt-0">
            <ClusterEventsTab />
          </TabsContent>

          <TabsContent value="platform-apps" className="mt-0">
            <PlatformAppsTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
