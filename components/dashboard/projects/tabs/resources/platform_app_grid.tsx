"use client";
import React from "react";
import { Rocket, ExternalLink, GitBranch, Globe } from "lucide-react";
import { PlatformApp } from "@/lib/supabase/types";
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

const PlatformAppGrid = ({
  data,
}: {
  data: PlatformApp[];
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Platform Apps ({data?.length || 0})
          </h2>
        </div>
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
          No platform apps found
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "running":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "deploying":
      case "building":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "stopped":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "failed":
      case "error":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider?.toLowerCase()) {
      case "github":
        return "🐙";
      case "gitlab":
        return "🦊";
      case "bitbucket":
        return "🪣";
      default:
        return "📦";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-emerald-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Platform Apps ({data.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((app) => {
          return (
            <Card
              key={app.id}
              className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 hover:border-emerald-500/50 bg-card border-border"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-1">🚀</div>
                    <div className="space-y-1">
                      <CardTitle className="text-base line-clamp-1 text-foreground">
                        {app.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground uppercase">
                        {app.framework || "App"} • {app.git_provider}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(app.status || "unknown")} text-xs font-medium`}
                  >
                    {app.status}
                  </Badge>
                </div>
              </CardHeader>

              <Separator className="bg-border" />

              <CardContent className="pt-4 space-y-4">
                {/* Repository Info */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Repository
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-lg">{getProviderIcon(app.git_provider)}</span>
                    <span className="text-foreground truncate">
                      {app.repository_name}
                    </span>
                  </div>
                </div>

                {/* Branch */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Branch
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-foreground">
                    <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{app.branch || "main"}</span>
                  </div>
                </div>

                {/* Features */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Configuration
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {app.auto_deploy && (
                      <Badge variant="secondary" className="text-xs">
                        Auto Deploy
                      </Badge>
                    )}
                    {app.framework && (
                      <Badge variant="secondary" className="text-xs">
                        {app.framework}
                      </Badge>
                    )}
                    {app.size && (
                      <Badge variant="secondary" className="text-xs capitalize">
                        {app.size}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Domain */}
                {app.slug && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">
                      Domain
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-foreground">
                      <Globe className="w-3.5 h-3.5 text-blue-400" />
                      <span className="truncate">{app.slug}.yourdomain.com</span>
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 gap-2">
                <Button
                  asChild
                  className="flex-1 group-hover:bg-emerald-600 group-hover:text-white transition-colors"
                  size="sm"
                >
                  <Link href={`/dashboard/services/apps-v1/${app.id}`}>
                    Manage App
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

export default PlatformAppGrid;
