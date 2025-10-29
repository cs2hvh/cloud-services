"use client";
import React from "react";
import { Cpu, Database, HardDrive, ExternalLink, Box } from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

const KubernetesGrid = ({
  data,
  type,
}: {
  data: Tables<"clusters_get">[];
  type: string;
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-blue-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Kubernetes Clusters ({data.length})
          </h2>
        </div>
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
          No kubernetes clusters found
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "ready":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "creating":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "error":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Box className="h-5 w-5 text-blue-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Kubernetes Clusters ({data.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((cluster) => (
          <Card
            key={cluster?.cluster_id}
            className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 hover:border-blue-500/50 bg-card border-border"
          >
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-3">
                  <div className="text-2xl mt-1">☸️</div>
                  <div className="space-y-1">
                    <CardTitle className="text-base line-clamp-1 text-foreground">
                      {cluster.cluster_name}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      {cluster.k8s_version} • {(cluster.workers && Array.isArray(cluster.workers) ? cluster.workers.length : 0) + 1} Nodes
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`${getStatusColor(cluster.status || "pending")} text-xs font-medium`}
                >
                  {cluster.status}
                </Badge>
              </div>
            </CardHeader>

            <Separator className="bg-border" />

            <CardContent className="pt-4 space-y-4">
              {/* Resources */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">
                  Node Resources
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {
                        (
                          cluster.node_config as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.cpu
                      }{" "}
                      vCPU
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Database className="w-3.5 h-3.5 text-green-400" />
                    <span>
                      {
                        (
                          cluster.node_config as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.ram
                      }{" "}
                      MB
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2 text-foreground">
                    <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {
                        (
                          cluster.node_config as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.storage
                      }{" "}
                      GB Storage
                    </span>
                  </div>
                </div>
              </div>

              {/* Connection Info */}
              {cluster.control_plane?.public_ip && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    API Endpoint
                  </h3>
                  <div className="bg-muted/50 p-2 rounded-md border border-border">
                    <code className="text-xs text-foreground">
                      {cluster.control_plane?.public_ip}:6443
                    </code>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-2 gap-2">
              <Button
                asChild
                className="flex-1 group-hover:bg-blue-600 group-hover:text-white transition-colors"
                size="sm"
              >
                <Link
                  href={{
                    pathname: `/dashboard/services/kubernetes/clusters/${encodeURIComponent(cluster.cluster_id)}`,
                    query: { clusterStatus: cluster.status },
                  }}
                >
                  Open Dashboard
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default KubernetesGrid;
