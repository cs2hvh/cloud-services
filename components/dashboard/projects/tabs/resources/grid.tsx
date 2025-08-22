"use client";
import React from "react";
import {
  Cpu,
  Database,
  HardDrive,
  Wifi,
  ExternalLink,
} from "lucide-react";
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
import { getDaysRemaining} from "@/lib/utils";

const GameServerGrid = ({ data }: { data: Tables<"game_servers">[] }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">No game servers found</div>
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map((server) => (
        <Card
          key={server.id}
          className="overflow-hidden transition-all duration-300 hover:shadow-md"
        >
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getGameIcon(server.game_type)}</span>
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
                    <span>{(server.resources as { cpu: number; ram: number; storage: number } | null)?.cpu} CPU</span>
                  </div>
                  <div className="flex items-center">
                    <Database className="w-4 h-4 mr-2 text-green-500" />
                    <span>{(server.resources as { cpu: number; ram: number; storage: number } | null)?.ram} GB RAM</span>
                  </div>
                  <div className="flex items-center">
                    <HardDrive className="w-4 h-4 mr-2 text-purple-500" />
                    <span>{(server.resources as { cpu: number; ram: number; storage: number } | null)?.storage} GB Storage</span>
                  </div>
                  <div className="flex items-center">
                    <Wifi className="w-4 h-4 mr-2 text-orange-500" />
                    <span>{(server.resources as { bandwith?: number } | null)?.bandwith} Mbps</span>
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
                  {server.ends_at ? getDaysRemaining(new Date(server.ends_at)) : "No expiry"} remaining
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2 flex gap-2">
            <Button
              className="w-1/2"
              variant="secondary"
              onClick={() =>
                window.open(
                  `https://panel.hav0k.dev/server/${server.identifier}`,
                  "_blank",
                )
              }
            >
              Open Control Panel
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              className="w-1/2"
              onClick={() =>
                window.open(
                  `https://panel.hav0k.dev/server/${server.identifier}`,
                  "_blank",
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
  );
};

export default GameServerGrid;
