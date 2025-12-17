"use client";
import React from "react";
import { Cloud, ExternalLink, MapPin, HardDrive, Globe, Shield } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
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

const ObjectSpaceGrid = ({
  data,
}: {
  data: ObjectSpaceBucket[];
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Object Storage ({data.length})
          </h2>
        </div>
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
          No object storage buckets found
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
      case "deleted":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const formatBytes = (bytes: number | undefined | null) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="h-5 w-5 text-cyan-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Object Storage ({data.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((bucket) => {
          const isPublic = bucket.acl === "public-read";
          const hasCORS = bucket.cors_enabled === true;
          
          return (
            <Card
              key={bucket.id}
              className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/10 hover:border-cyan-500/50 bg-card border-border"
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-1">☁️</div>
                    <div className="space-y-1">
                      <CardTitle className="text-base line-clamp-1 text-foreground">
                        {bucket.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        {bucket.type || "Bucket"} • {bucket.region || "N/A"}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${getStatusColor(bucket.status || "active")} text-xs font-medium`}
                  >
                    {bucket.status}
                  </Badge>
                </div>
              </CardHeader>

              <Separator className="bg-border" />

              <CardContent className="pt-4 space-y-4">
                {/* Access & Region */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Configuration
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-foreground">
                      {isPublic ? (
                        <>
                          <Globe className="w-3.5 h-3.5 text-green-400" />
                          <span>Public</span>
                        </>
                      ) : (
                        <>
                          <Shield className="w-3.5 h-3.5 text-blue-400" />
                          <span>Private</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground">
                      <MapPin className="w-3.5 h-3.5 text-purple-400" />
                      <span className="truncate">{bucket.region || "N/A"}</span>
                    </div>
                  </div>
                </div>

               
                

                {/* Features */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Features
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {isPublic && (
                      <Badge variant="secondary" className="text-xs">
                        Public Access
                      </Badge>
                    )}
                    {hasCORS && (
                      <Badge variant="secondary" className="text-xs">
                        CORS Enabled
                      </Badge>
                    )}
                    {bucket.versioning_enabled && (
                      <Badge variant="secondary" className="text-xs">
                        Versioning
                      </Badge>
                    )}
                    {!isPublic && !hasCORS && !bucket.versioning_enabled && (
                      <span className="text-xs text-muted-foreground">
                        No features configured
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2 gap-2">
                <Button
                  asChild
                  className="flex-1 group-hover:bg-cyan-600 group-hover:text-white transition-colors"
                  size="sm"
                >
                  <Link href={`/dashboard/services/object-storage/${bucket.id}`}>
                    Manage Bucket
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

export default ObjectSpaceGrid;
