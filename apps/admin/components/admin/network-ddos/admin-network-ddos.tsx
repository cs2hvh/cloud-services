"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Shield, Settings } from "lucide-react";
import { Admin_SpectrumApp } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DDoSUsersTab from "@admin/components/admin/network-ddos/ddos-users-tab";
import DDoSSettingsTab from "@admin/components/admin/network-ddos/ddos-settings-tab";

interface PageProps {
  all_apps: Admin_SpectrumApp[];
}

export default function AdminNetworkDDoS({ all_apps }: PageProps) {
  const [activeTab, setActiveTab] = useState("ddos-users");

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
              <Shield className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Network DDoS Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {all_apps.length} protected application{all_apps.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="ddos-users"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Shield className="h-4 w-4 mr-2" />
              DDoS Users
            </TabsTrigger>
            <TabsTrigger
              value="ddos-settings"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Settings className="h-4 w-4 mr-2" />
              DDoS Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ddos-users" className="mt-0">
            <DDoSUsersTab all_apps={all_apps} />
          </TabsContent>

          <TabsContent value="ddos-settings" className="mt-0">
            <DDoSSettingsTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
