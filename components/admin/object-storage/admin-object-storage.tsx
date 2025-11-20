"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Archive, Package } from "lucide-react";
import { Admin_Bucket} from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StorageUsersTab from "@/components/admin/object-storage/storage-users-tab";
import StoragePlansTab from "@/components/admin/object-storage/storage-plans-tab";

interface PageProps {
  all_buckets: Admin_Bucket[];
 // all_products: Tables<"products">[];
}

export default function AdminObjectStorage({ all_buckets }: PageProps) {
  const [activeTab, setActiveTab] = useState("storage-users");

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
              <Archive className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Object Storage Management
              </h1>
              {/* <p className="text-sm text-neutral-400 mt-0.5">
                {all_buckets.length} buckets · {all_products.length} plans
              </p> */}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="storage-users"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Archive className="h-4 w-4 mr-2" />
              Storage Users
            </TabsTrigger>
            <TabsTrigger
              value="storage-plans"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Package className="h-4 w-4 mr-2" />
              Storage Setting
            </TabsTrigger>
          </TabsList>

          <TabsContent value="storage-users" className="mt-0">
            <StorageUsersTab all_buckets={all_buckets} />
          </TabsContent>

          <TabsContent value="storage-plans" className="mt-0">
            <StoragePlansTab  />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}