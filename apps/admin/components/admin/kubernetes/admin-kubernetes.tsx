"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Server, Package, Layers } from "lucide-react";
import { Admin_KubernetesCluster, Tables } from "@/lib/supabase/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import KubernetesUsersTab from "./kubernetes-users-tab";
import KubernetesPlansTab from "./kubernetes-plans-tab";
import InternalClustersTab from "./internal-clusters-tab";

interface PageProps {
  all_clusters: Admin_KubernetesCluster[];
  all_products: Tables<"products">[];
  /** Route prefix of the page hosting this view (admin panel passes its own). */
  basePath?: string;
}

export default function AdminKubernetes({ all_clusters, all_products, basePath = "/dashboard/admin/kubernetes" }: PageProps) {
  const [activeTab, setActiveTab] = useState("k8s-users");

  const userClusterCount = all_clusters.filter((c) => c.node_config?.provision_config?.type !== "internal").length;
  const internalClusterCount = all_clusters.filter((c) => c.node_config?.provision_config?.type === "internal").length;

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
              <Server className="h-6 w-6 text-foreground/80" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Kubernetes Management
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {userClusterCount} user cluster{userClusterCount !== 1 ? 's' : ''}
                {' · '}
                {internalClusterCount} internal cluster{internalClusterCount !== 1 ? 's' : ''}
                {' · '}
                {all_products.length} plan{all_products.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 gap-2 bg-transparent p-0 h-auto mb-6">
            <TabsTrigger
              value="k8s-users"
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
            >
              <Server className="h-4 w-4 mr-2" />
              Kubernetes Clusters
            </TabsTrigger>
            <TabsTrigger
              value="k8s-plans"
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
            >
              <Package className="h-4 w-4 mr-2" />
              Kubernetes Plans
            </TabsTrigger>
            <TabsTrigger
              value="k8s-internal"
              className="cursor-pointer text-sm font-medium py-2.5 px-4 rounded-lg data-[state=active]:bg-[#3987e5] data-[state=active]:text-foreground data-[state=active]:shadow-md bg-card text-foreground hover:bg-white/[0.06] transition-all border border-border"
            >
              <Layers className="h-4 w-4 mr-2" />
              Internal Clusters
            </TabsTrigger>
          </TabsList>

          <TabsContent value="k8s-users" className="mt-0">
            <KubernetesUsersTab all_clusters={all_clusters} basePath={basePath} />
          </TabsContent>

          <TabsContent value="k8s-plans" className="mt-0">
            <KubernetesPlansTab all_products={all_products} />
          </TabsContent>

          <TabsContent value="k8s-internal" className="mt-0">
            <InternalClustersTab all_clusters={all_clusters} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
