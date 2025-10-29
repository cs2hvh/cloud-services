"use client";
import React from "react";
import {
  Cpu,
  Database,
  HardDrive,
  ExternalLink,
  Gamepad2,
  Clock,
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
import { getDaysRemaining } from "@/lib/utils";

const GameServerGrid = ({
  data,
  type,
}: {
  data: Tables<"game_servers">[];
  type: string;
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-orange-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Game Servers ({data.length})
          </h2>
        </div>
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          No game servers found
        </div>
      </div>
    );
  }

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
      case "cs2":
        return "🔫";
      default:
        return "🎮";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
      case "running":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "stopped":
      case "offline":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "starting":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Gamepad2 className="h-5 w-5 text-orange-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Game Servers ({data.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((server) => (
          <Card
            key={server.id}
            className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10 hover:border-orange-500/50 bg-card border-border"
          >
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-3">
                  <div className="text-2xl mt-1">
                    {getGameIcon(server.game_type)}
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base line-clamp-1 text-foreground">
                      {server.name}
                    </CardTitle>
                    <CardDescription className="text-xs capitalize text-muted-foreground">
                      {server.game_type} Server
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`${getStatusColor(server.status || "unknown")} text-xs font-medium`}
                >
                  {server.status}
                </Badge>
              </div>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4 space-y-4">
              {/* Resources */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">
                  Resources
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {
                        (
                          server.resources as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.cpu || "N/A"
                      }{" "}
                      CPU
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Database className="w-3.5 h-3.5 text-green-400" />
                    <span>
                      {
                        (
                          server.resources as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.ram || "N/A"
                      }{" "}
                      MB
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2 text-foreground">
                    <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {
                        (
                          server.resources as {
                            cpu: number;
                            ram: number;
                            storage: number;
                          } | null
                        )?.storage || "N/A"
                      }{" "}
                      GB Storage
                    </span>
                  </div>
                </div>
              </div>

              {/* Connection Info */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">
                  Connection
                </h3>
                <div className="bg-muted/50 p-2 rounded-md border border-border">
                  <code className="text-xs text-foreground">
                    {server.ip}:{server.port}
                  </code>
                </div>
              </div>

              {/* Subscription */}
              {server.ends_at && (
                <div className="flex items-center gap-2 text-xs text-foreground">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>
                    {getDaysRemaining(new Date(server.ends_at))} remaining
                  </span>
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-2 gap-2">
              <Button
                className="flex-1 group-hover:bg-orange-600 group-hover:text-white transition-colors"
                size="sm"
                onClick={() =>
                  window.open(
                    `https://panel.hav0k.dev/server/${server.identifier}`,
                    "_blank"
                  )
                }
              >
                Open Panel
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default GameServerGrid;
