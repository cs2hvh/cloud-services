"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AppStatusBadgeProps {
  status: string;
  building?: boolean;
  /** "sm" = compact (app card list), "md" = default (detail page) */
  size?: "sm" | "md";
}

export function AppStatusBadge({ status, building, size = "md" }: AppStatusBadgeProps) {
  const compact = size === "sm";
  const iconCls = compact ? "w-2.5 h-2.5 mr-1" : "w-3 h-3 mr-1";
  const badgeCls = compact ? "text-[10px] px-1.5 py-0" : "";
  const base = `${badgeCls} rounded-none`;

  if (building || status === "building") {
    return (
      <Badge className={`${base} border-blue-500/30 bg-blue-500/20 text-blue-400`}>
        <Loader2 className={`${iconCls} animate-spin`} />
        Building
      </Badge>
    );
  }

  switch (status) {
    case "running":
      return (
        <Badge className={`${base} border-green-500/30 bg-green-500/20 text-green-400`}>
          <CheckCircle2 className={iconCls} />
          Running
        </Badge>
      );
    case "failed":
      return (
        <Badge className={`${base} border-red-500/30 bg-red-500/20 text-red-400`}>
          <XCircle className={iconCls} />
          Failed
        </Badge>
      );
    case "deleting":
      return (
        <Badge className={`${base} border-yellow-500/30 bg-yellow-500/20 text-yellow-400`}>
          <Loader2 className={`${iconCls} animate-spin`} />
          Deleting
        </Badge>
      );
    default:
      return (
        <Badge className={`${base} border-yellow-500/30 bg-yellow-500/20 text-yellow-400`}>
          Pending
        </Badge>
      );
  }
}
