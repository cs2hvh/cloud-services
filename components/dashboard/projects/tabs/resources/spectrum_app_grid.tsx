"use client";
import React from "react";
import { Shield, ExternalLink, Activity } from "lucide-react";
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

const SpectrumAppGrid = ({
  data,
}: {
  data: Tables<"spectrum_apps">[];
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-orange-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Spectrum Apps ({data.length})
          </h2>
        </div>
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
          No spectrum apps found
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "creating":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "inactive":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "error":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-orange-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Spectrum Apps ({data.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((app) => {
          const dns = app.dns as { original_name?: string } | null;
          const appName = dns?.original_name || "Unnamed App";
          
          return (
            <Card
              key={app.id}
              className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/10 hover:border-orange-500/50 bg-card border-border"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-1">🛡️</div>
                    <div className="space-y-1">
                      <CardTitle className="text-base line-clamp-1 text-foreground">
                        {appName}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground uppercase">
                        {app.protocol} • DDoS Protection
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(app.status || "inactive")} text-xs font-medium`}
                  >
                    {app.status}
                  </Badge>
                </div>
              </CardHeader>

              <Separator className="bg-border" />

              <CardContent className="pt-4 space-y-4">
                {/* Protocol & Traffic Type */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Configuration
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-foreground">
                      <Activity className="w-3.5 h-3.5 text-blue-400" />
                      <span>{app.protocol}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground capitalize">
                      <Shield className="w-3.5 h-3.5 text-orange-400" />
                      <span>{app.traffic_type || "N/A"}</span>
                    </div>
                  </div>
                </div>

                {/* Origin IP */}
                {app.origin_direct && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">
                      Origin Server
                    </h3>
                    <div className="bg-muted/50 p-2 rounded-md border border-border">
                      <code className="text-xs text-foreground">
                        {Array.isArray(app.origin_direct) 
                          ? app.origin_direct.join(", ") 
                          : app.origin_direct}
                      </code>
                    </div>
                  </div>
                )}

                {/* Features */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Features
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {app.tls && (
                      <Badge variant="secondary" className="text-xs">
                        TLS
                      </Badge>
                    )}
                    {app.ip_firewall && (
                      <Badge variant="secondary" className="text-xs">
                        IP Firewall
                      </Badge>
                    )}
                    {app.proxy_protocol && (
                      <Badge variant="secondary" className="text-xs">
                        Proxy Protocol
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2 gap-2">
                <Button
                  asChild
                  className="flex-1 group-hover:bg-orange-600 group-hover:text-white transition-colors"
                  size="sm"
                >
                  <Link href={`/dashboard/services/network-ddos/${app.spectrum_id}`}>
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

export default SpectrumAppGrid;
