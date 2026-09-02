"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Archive, Package } from "lucide-react";
import { Admin_Bucket} from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StorageUsersTab from "@admin/components/admin/object-storage/storage-users-tab";
import StoragePlansTab from "@admin/components/admin/object-storage/storage-plans-tab";

interface PageProps {
  all_buckets: Admin_Bucket[];
 // all_products: Tables<"products">[];
}

export default function AdminObjectStorage({ all_buckets }: PageProps) {
  const [activeTab, setActiveTab] = useState("storage-users");

  return (
    <div className="">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1600px] mx-auto"
      >
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/[0.06] rounded-lg">
              <Archive className="h-6 w-6 text-foreground/80" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Object Storage Management
              </h1>
              {/* <p className="text-sm text-muted-foreground mt-0.5">
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
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
            >
              <Archive className="h-4 w-4 mr-2" />
              Storage Users
            </TabsTrigger>
            <TabsTrigger
              value="storage-plans"
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
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