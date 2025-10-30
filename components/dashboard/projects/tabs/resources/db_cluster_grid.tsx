"use client";
import React from "react";
import { Database, ExternalLink, Cpu, MapPin } from "lucide-react";
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
import { dbLocations } from "@/config/locations";
import { DatabaseIcon } from "@/components/dashboard/database/database-icon";

const DbClusterGrid = ({
  data,
}: {
  data: Tables<"database_clusters">[];
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-purple-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Database Clusters ({data.length})
          </h2>
        </div>
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
          No database clusters found
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "online":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "offline":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "creating":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  // const getEngineIcon = (engine: string) => {
  //   const icons: Record<string, string> = {
  //     postgresql: "P",
  //     mysql: "M",
  //     mongodb: "Mo",
  //     redis: "R",
  //   };
  //   return icons[engine?.toLowerCase()] || "DB";
  // };

  const parseSize = (size: string) => {
    if (!size) return { vcpu: "N/A", ram: "N/A" };
    const match = size.match(/(\d+)vcpu-(\d+)gb/i);
    if (match) {
      return { vcpu: match[1], ram: match[2] };
    }
    return { vcpu: "N/A", ram: "N/A" };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-purple-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Database Clusters ({data.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((cluster) => {
          const { vcpu, ram } = parseSize(cluster.size);
          return (
            <Card
              key={cluster.id}
              className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 hover:border-purple-500/50 bg-card border-border"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-1">
                      <DatabaseIcon engine={cluster.engine} className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-base line-clamp-1 text-foreground">
                        {cluster.name}
                      </CardTitle>
                      <CardDescription className="text-xs capitalize text-muted-foreground">
                        {cluster.engine} v{cluster.version || "Latest"}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(cluster.status)} text-xs font-medium`}
                  >
                    {cluster.status}
                  </Badge>
                </div>
              </CardHeader>

              <Separator className="bg-border" />

              <CardContent className="pt-4 space-y-4">
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Resources
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-foreground">
                      <Cpu className="w-3.5 h-3.5 text-blue-400" />
                      <span>{vcpu} vCPU</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground">
                      <Database className="w-3.5 h-3.5 text-green-400" />
                      <span>{ram} GB RAM</span>
                    </div>
                     <div className="flex items-center gap-1.5 text-foreground">
                      <Database className="w-3.5 h-3.5 text-green-400" />
                      <span>{ram} GB RAM</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Region
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{ dbLocations.find((loc) => loc.short === cluster.region)?.city || "N/A"}</span>
                  </div>
                </div>

                 <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Version
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                     <DatabaseIcon engine={cluster.engine} className="h-6 w-6" />
                    <span className="truncate">{cluster.version}</span>
                  </div>
                </div>

               
              </CardContent>

              <CardFooter className="pt-2 gap-2">
                <Button
                  asChild
                  className="flex-1 group-hover:bg-purple-600 group-hover:text-white transition-colors"
                  size="sm"
                >
                  <Link href={`/dashboard/services/database/clusters/${cluster.cluster_id}`}>
                    Open Dashboard
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DbClusterGrid;