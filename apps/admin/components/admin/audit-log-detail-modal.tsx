"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { type AuditLogEntry } from "@admin/components/admin/audit-log-table";

interface AuditLogDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: AuditLogEntry | null;
}

export function AuditLogDetailModal({
  isOpen,
  onClose,
  log,
}: AuditLogDetailModalProps) {
  if (!log) return null;

  const serviceTypeLabels: Record<string, string> = {
    database: "Database",
    kubernetes: "Kubernetes",
    platform_app: "Platform App",
    platform_apps: "Platform Apps",
    network_ddos: "Network/DDoS",
    object_storage: "Object Storage",
    auth: "Authentication",
  };

  const actionColors: Record<string, string> = {
    create: "bg-emerald-950/50 text-emerald-400 border border-emerald-900",
    update: "bg-blue-950/50 text-blue-400 border border-blue-900",
    delete: "bg-red-950/50 text-red-400 border border-red-900",
    login: "bg-purple-950/50 text-purple-400 border border-purple-900",
    logout: "bg-neutral-800 text-neutral-400 border border-neutral-700",
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-neutral-900 border-neutral-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-white">Audit Log Details</DialogTitle>
          <DialogDescription className="text-neutral-500 text-sm">
            Complete information about this audit event
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pr-4">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-400">
                Action
              </p>
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mt-1 ${actionColors[log.action as keyof typeof actionColors]}`}
              >
                {log.action.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-400">
                Service Type
              </p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700 mt-1">
                {serviceTypeLabels[log.service_type] || log.service_type}
              </span>
            </div>
          </div>

          <Separator className="bg-neutral-800" />

          {/* User Info */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">User Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-neutral-400">Email</p>
                <p className="font-medium text-white">{log.user_email || "Unknown"}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-400">Role</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-800 text-neutral-400 mt-1">
                  {log.user_role}
                </span>
              </div>
              <div>
                <p className="text-sm text-neutral-400">User ID</p>
                <p className="font-mono text-xs text-neutral-300">{log.user_id}</p>
              </div>
            </div>
          </div>

          <Separator className="bg-neutral-800" />

          {/* Service Info */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Service Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-neutral-400">Service Name</p>
                <p className="font-medium text-white">{log.service_name || "Unnamed"}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-400">Service ID</p>
                <p className="font-mono text-xs text-neutral-300">{log.service_id}</p>
              </div>
            </div>
          </div>

          <Separator className="bg-neutral-800" />

          {/* Request Info */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Request Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-neutral-400">IP Address</p>
                <p className="font-mono text-sm text-white">
                  {log.ip_address || "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-sm text-neutral-400">Timestamp</p>
                <p suppressHydrationWarning className="text-sm text-white">
                  {format(new Date(log.created_at), "MMM dd, yyyy HH:mm:ss")}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-neutral-400">User Agent</p>
                <p className="font-mono text-xs break-all text-neutral-300">
                  {log.user_agent || "Unknown"}
                </p>
              </div>
              {log.request_id && (
                <div className="col-span-2">
                  <p className="text-sm text-neutral-400">Request ID</p>
                  <p className="font-mono text-xs text-neutral-300">{log.request_id}</p>
                </div>
              )}
            </div>
          </div>

          {/* State Changes (for UPDATE action) */}
          {log.action === "update" && log.before_state && log.after_state && (
            <>
              <Separator className="bg-neutral-800" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-white">State Changes</h4>
                <div className="text-sm space-y-2">
                  <p className="text-neutral-400">
                    Review the before/after states below:
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Before State (for DELETE) */}
          {log.action === "delete" && log.before_state && (
            <>
              <Separator className="bg-neutral-800" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-white">
                  Deleted Resource State
                </h4>
                <pre className="rounded-lg bg-neutral-950 border border-neutral-800 p-4 text-xs overflow-auto text-neutral-300">
                  {JSON.stringify(log.before_state, null, 2)}
                </pre>
              </div>
            </>
          )}

          {/* After State (for CREATE) */}
          {log.action === "create" && log.after_state && (
            <>
              <Separator className="bg-neutral-800" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-white">
                  Created Resource State
                </h4>
                <pre className="rounded-lg bg-neutral-950 border border-neutral-800 p-4 text-xs overflow-auto text-neutral-300">
                  {JSON.stringify(log.after_state, null, 2)}
                </pre>
              </div>
            </>
          )}

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <>
              <Separator className="bg-neutral-800" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-white">
                  Additional Metadata
                </h4>
                <pre className="rounded-lg bg-neutral-950 border border-neutral-800 p-4 text-xs overflow-auto text-neutral-300">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            </>
          )}

          {/* Integrity Check */}
          {log.checksum && (
            <>
              <Separator className="bg-neutral-800" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-white">
                  Tamper Detection
                </h4>
                <div>
                  <p className="text-sm text-neutral-400">
                    SHA-256 Checksum
                  </p>
                  <p className="font-mono text-xs break-all mt-1 text-neutral-300">
                    {log.checksum}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
