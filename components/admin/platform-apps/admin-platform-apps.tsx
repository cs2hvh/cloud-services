"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Rocket, Server, DollarSign } from "lucide-react";
import { Admin_PlatformApp } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AppsListTab from "@/components/admin/platform-apps/apps-list-tab";
import ClusterUsageTab from "@/components/admin/platform-apps/cluster-usage-tab";
import PricingTab from "@/components/admin/platform-apps/pricing-tab";

interface PageProps {
  all_apps: Admin_PlatformApp[];
}

export default function AdminPlatformApps({ all_apps }: PageProps) {
  const [activeTab, setActiveTab] = useState("deployed-apps");

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
              <Rocket className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Platform Apps Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {all_apps.length} deployed apps
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="deployed-apps"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Deployed Apps
            </TabsTrigger>
            <TabsTrigger
              value="cluster-usage"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Server className="h-4 w-4 mr-2" />
              Cluster Usage
            </TabsTrigger>
            <TabsTrigger
              value="pricing"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Pricing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deployed-apps" className="mt-0">
            <AppsListTab all_apps={all_apps} />
          </TabsContent>

          <TabsContent value="cluster-usage" className="mt-0">
            <ClusterUsageTab />
          </TabsContent>

          <TabsContent value="pricing" className="mt-0">
            <PricingTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
