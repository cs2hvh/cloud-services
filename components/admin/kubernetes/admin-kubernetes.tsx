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
}

export default function AdminKubernetes({ all_clusters, all_products }: PageProps) {
  const [activeTab, setActiveTab] = useState("k8s-users");

  const userClusterCount = all_clusters.filter((c) => !!c.project_id).length;
  const internalClusterCount = all_clusters.filter((c) => !c.project_id).length;

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
              <Server className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Kubernetes Management
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
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
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Server className="h-4 w-4 mr-2" />
              Kubernetes Clusters
            </TabsTrigger>
            <TabsTrigger
              value="k8s-plans"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Package className="h-4 w-4 mr-2" />
              Kubernetes Plans
            </TabsTrigger>
            <TabsTrigger
              value="k8s-internal"
              className="cursor-pointer text-sm sm:text-base font-semibold py-3 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-md bg-neutral-900 text-white hover:bg-neutral-800 transition-all border border-neutral-800"
            >
              <Layers className="h-4 w-4 mr-2" />
              Internal Clusters
            </TabsTrigger>
          </TabsList>

          <TabsContent value="k8s-users" className="mt-0">
            <KubernetesUsersTab all_clusters={all_clusters} />
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
