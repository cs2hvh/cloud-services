"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Database as DatabaseIcon, Package } from "lucide-react";
import { Admin_Database, Tables } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DbUsersTab from "./db-users-tab";
import DbPlansTab from "./db-plans-tab";

interface PageProps {
  all_databases: Admin_Database[];
  all_products: Tables<"products">[];
  /** Route prefix of the page hosting this view (admin panel passes its own). */
  basePath?: string;
}

export default function AdminDatabases({ all_databases, all_products, basePath = "/dashboard/admin/databases" }: PageProps) {
  const [activeTab, setActiveTab] = useState("db-users");

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
              <DatabaseIcon className="h-6 w-6 text-foreground/80" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Database Management
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {all_databases.length} databases · {all_products.length} plans
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="db-users"
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
            >
              <DatabaseIcon className="h-4 w-4 mr-2" />
              Database Users
            </TabsTrigger>
            <TabsTrigger
              value="db-plans"
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
            >
              <Package className="h-4 w-4 mr-2" />
              Database Plans
            </TabsTrigger>
          </TabsList>

          <TabsContent value="db-users" className="mt-0">
            <DbUsersTab all_databases={all_databases} basePath={basePath} />
          </TabsContent>

          <TabsContent value="db-plans" className="mt-0">
            <DbPlansTab all_products={all_products} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}