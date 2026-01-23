"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_email?: string;
  user_role: string;
  action: "create" | "update" | "delete" | "login" | "logout";
  service_type: string;
  service_id: string;
  service_name?: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
}

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  onViewDetails: (logId: string) => void;
  isLoading?: boolean;
}

const actionColors = {
  create: "bg-emerald-950/50 text-emerald-400 border border-emerald-900",
  update: "bg-blue-950/50 text-blue-400 border border-blue-900",
  delete: "bg-red-950/50 text-red-400 border border-red-900",
  login: "bg-purple-950/50 text-purple-400 border border-purple-900",
  logout: "bg-neutral-800 text-neutral-400 border border-neutral-700",
};

const serviceTypeLabels: Record<string, string> = {
  database: "Database",
  kubernetes: "Kubernetes",
  platform_app: "Platform App",
  platform_apps: "Platform Apps",
  network_ddos: "Network/DDoS",
  object_storage: "Object Storage",
  auth: "Authentication",
};

export function AuditLogTable({
  logs,
  onViewDetails,
  isLoading,
}: AuditLogTableProps) {
  if (isLoading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mx-auto mb-3" />
          <p className="text-neutral-400 text-sm">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400">No audit logs found</p>
          <p className="text-sm text-neutral-500 mt-1">
            Try adjusting your filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader className="bg-neutral-800/50 border-b border-neutral-800">
        <TableRow>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Timestamp</TableHead>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider">User</TableHead>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Action</TableHead>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Service</TableHead>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Resource</TableHead>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider">IP Address</TableHead>
          <TableHead className="text-xs font-medium text-neutral-400 uppercase tracking-wider text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-neutral-800">
        {logs.map((log) => (
          <TableRow key={log.id} className="hover:bg-neutral-800/30 transition-colors">
            <TableCell className="font-mono text-xs text-neutral-300">
              <div className="flex flex-col">
                <span>{new Date(log.created_at).toLocaleString()}</span>
                <span className="text-neutral-500 text-xs">
                  {formatDistanceToNow(new Date(log.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium text-white text-sm">
                  {log.user_email || "Unknown"}
                </span>
                <span className="font-mono text-xs text-neutral-500">
                  {log.user_id.slice(0, 8)}...
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-400 mt-1 w-fit">
                  {log.user_role}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${actionColors[log.action]}`}>
                {log.action.toUpperCase()}
              </span>
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                {serviceTypeLabels[log.service_type] || log.service_type}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium text-white text-sm">
                  {log.service_name || "Unnamed"}
                </span>
                <span className="font-mono text-xs text-neutral-500">
                  {log.service_id.slice(0, 12)}...
                </span>
              </div>
            </TableCell>
            <TableCell>
              <span className="font-mono text-xs text-neutral-400">
                {log.ip_address || "Unknown"}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onViewDetails(log.id)}
                className="h-8 px-3 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
