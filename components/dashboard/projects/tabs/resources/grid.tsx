"use client";
import React from "react";
import {
  Cpu,
  Database,
  HardDrive,
  Wifi,
  ExternalLink,
} from "lucide-react";
import { Json, Tables } from "@/lib/supabase/types";
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
import { getDaysRemaining } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

type TableTypes = "clusters" | "game_servers"; // Add more types as needed

// interface GameServerGridProps {
//   // data: Tables<`${TableTypes}`>[];  // This will use the `Tables` type dynamically
//   data: {
//     cluster_id: string;
//     id: string;
//     clusterName: string;
//     project_id: string;
//     owner_id: string;
//     control_plane?: string | null; // e.g., API VIP or CP-1 IP
//     workers?: string[]; // list of worker IPs/hosts
//     createStatus?: boolean;
//     connectStatus?: boolean;
//     verifyStatus?: boolean;
//     kubeConfig?: string | null; // kubeconfig YAML
//     node_config?: null; // {region, plan, cpu, ram, disk ...}
//     cniPlugin?: "flannel" | "calico" | "cilium" | string | null;
//     k8s_version?: string | null;
//     status?: string | null;
//     allocation: number;
//     created_at: string | null;
//     ends_at: string | null;
//     game_type: string;
//     //id: number;
//     identifier: string;
//     ip: string;
//     location_id: number | null;
//     name: string;
//     node: number;
//     plan: string | null;
//     port: number;
//     // project_id: string | null;
//     resources: Json;
//     //status: string | null;
//     user_id: string | null;
//   }[];
//   type: TableTypes; // `type` can be 'server' | 'game', etc.
// }

const GameServerGrid = ({
  data,
  type,
}: {
  data: Tables<"game_servers">[];
  type: string;
}) => {
  // const router = useRouter();
  if (!data || data.length === 0) {
    return (
      <>
        <h1 className="text-xs ms-2 text-white font-semibold mb-2 uppercase">
          {type} ({data.length})
        </h1>
        <div className="text-center p-8 text-gray-500">No {type} found</div>
      </>
    );
  }

  // Function to get a nice icon for game type
  const getGameIcon = (gameType: string) => {
    switch (gameType?.toLowerCase()) {
      case "minecraft":
        return "🧱";
      case "valheim":
        return "⚔️";
      case "rust":
        return "🔧";
      case "ark":
        return "🦖";
      case "csgo":
        return "🔫";
      default:
        return "🎮";
    }
  };

  return (
    <div className="mx-6">
      <div>
        <h1 className="text-xs text-white font-semibold mb-2 uppercase">
          {type} ({data.length})
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.map((server) => (
          <Card
            key={server.id}
            className="overflow-hidden transition-all duration-300 hover:shadow-md"
          >
            <CardHeader>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {getGameIcon(server.game_type)}
                  </span>
                  <CardTitle>{server.name}</CardTitle>
                </div>
                {server.status === "active" ? (
                  <div className="relative">
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 border-green-300"
                    >
                      Active
                    </Badge>
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-gray-100 text-gray-800 border-gray-300"
                  >
                    {server.status}
                  </Badge>
                )}
              </div>
              <CardDescription className="capitalize">
                {server.game_type} Server
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent>
              {/* Resources */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Resources</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center">
                      <Cpu className="w-4 h-4 mr-2 text-blue-500" />
                      <span>
                        {
                          (
                            server.resources as {
                              cpu: number;
                              ram: number;
                              storage: number;
                            } | null
                          )?.cpu
                        }{" "}
                        CPU
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Database className="w-4 h-4 mr-2 text-green-500" />
                      <span>
                        {
                          (
                            server.resources as {
                              cpu: number;
                              ram: number;
                              storage: number;
                            } | null
                          )?.ram
                        }{" "}
                        MB RAM
                      </span>
                    </div>
                    <div className="flex items-center">
                      <HardDrive className="w-4 h-4 mr-2 text-purple-500" />
                      <span>
                        {
                          (
                            server.resources as {
                              cpu: number;
                              ram: number;
                              storage: number;
                            } | null
                          )?.storage
                        }{" "}
                        GB Storage
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Wifi className="w-4 h-4 mr-2 text-orange-500" />
                      <span>
                        {
                          (server.resources as { bandwith?: number } | null)
                            ?.bandwith
                        }{" "}
                        Mbps
                      </span>
                    </div>
                  </div>
                </div>

                {/* Connection Info */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Connection Info</h3>
                  <div className="bg-muted p-2 rounded-md font-mono text-sm">
                    {server.ip}:{server.port}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">Subscription</h3>
                  <div className="font-mono text-sm">
                    {server.ends_at
                      ? getDaysRemaining(new Date(server.ends_at))
                      : "No expiry"}{" "}
                    remaining
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-2 flex gap-2">
              Open Control Panel
              <Link
                href={{
                  pathname: `/dashboard/services/kubernetes/clusters/${server.id}`,
                  query: { clusterStatus: "ready" },
                }}
                className="h-4 w-4"
              />
              <Button
                className="w-1/2"
                onClick={() =>
                  window.open(
                    `https://panel.hav0k.dev/server/${server.identifier}`,
                    "_blank"
                  )
                }
              >
                Renew Subscription
                <ExternalLink className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default GameServerGrid;
