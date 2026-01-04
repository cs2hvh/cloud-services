"use client";

import { motion } from "motion/react";
import { Rocket } from "lucide-react";
import { Admin_PlatformApp } from "@/lib/supabase/types";
import AppsListTab from "@/components/admin/platform-apps/apps-list-tab";

interface PageProps {
  all_apps: Admin_PlatformApp[];
}

export default function AdminPlatformApps({ all_apps }: PageProps) {
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

        {/* Apps List */}
        <AppsListTab all_apps={all_apps} />
      </motion.div>
    </div>
  );
}
