"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MoreHorizontal,
  Play,
  Square,
  RotateCw,
  Trash2,
  Copy,
  ExternalLink,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios/axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm";
import { StatusBadge } from "./status-badge";
import type { Pagination, ServerRow } from "./types";

const STATUS_OPTIONS = [
  "running",
  "stopped",
  "provisioning",
  "suspended",
  "failed",
  "error",
];

export function ServersTable({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, status, provider]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/servers", {
        params: {
          page,
          limit: 25,
          search: debounced || undefined,
          status: status === "all" ? undefined : status,
          provider: provider === "all" ? undefined : provider,
        },
      });
      setRows(res.data.data ?? []);
      setPagination(res.data.pagination ?? null);
    } catch {
      /* toasted by interceptor */
    } finally {
      setLoading(false);
    }
  }, [page, debounced, status, provider]);

  useEffect(() => {
    load();
  }, [load]);

  const power = async (server: ServerRow, action: "start" | "stop" | "reboot") => {
    if (action !== "start") {
      const ok = await confirm({
        title: `${action === "stop" ? "Stop" : "Reboot"} ${server.name}?`,
        description: `This ${action === "stop" ? "shuts down" : "restarts"} ${
          server.owner_email ?? "the owner"
        }'s server.`,
        confirmText: action === "stop" ? "Stop server" : "Reboot server",
        danger: action === "stop",
      });
      if (!ok) return;
    }
    setBusyId(server.id);
    try {
      const res = await api.post(`/admin/servers/${server.id}/power`, { action });
      toast.success(`${server.name}: ${action} sent (status ${res.data.status})`);
      await load();
      onChanged?.();
    } catch {
      /* toasted by interceptor */
    } finally {
      setBusyId(null);
    }
  };

  const destroy = async (server: ServerRow) => {
    const ok = await confirm({
      title: `Delete ${server.name}?`,
      description: `Permanently destroys this ${server.provider} server owned by ${
        server.owner_email ?? "unknown"
      }, tears down the instance and closes its billing meter. This cannot be undone.`,
      confirmText: "Delete server",
      danger: true,
    });
    if (!ok) return;
    setBusyId(server.id);
    try {
      await api.delete(`/admin/servers/${server.id}`);
      toast.success(`${server.name} deleted`);
      await load();
      onChanged?.();
    } catch {
      /* toasted by interceptor */
    } finally {
      setBusyId(null);
    }
  };

  const specs = (s: ServerRow) =>
    [
      s.cpu_cores ? `${s.cpu_cores} vCPU` : null,
      s.memory_mb ? `${Math.round(s.memory_mb / 1024)} GB` : null,
      s.disk_gb ? `${s.disk_gb} GB disk` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const empty = useMemo(
    () => !loading && rows.length === 0,
    [loading, rows.length],
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, owner email, OS, or exact IP"
            className="w-72 pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            <SelectItem value="linode">Linode</SelectItem>
            <SelectItem value="proxmox">Proxmox</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {pagination && (
            <span className="text-xs text-muted-foreground">
              {pagination.total} server{pagination.total === 1 ? "" : "s"}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Server</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Specs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">$/hr</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {empty && (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  No servers match the current filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.id} className={busyId === s.id ? "opacity-50" : undefined}>
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.ip ?? "no IP"}
                    {s.os ? ` · ${s.os}` : ""}
                  </div>
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm">
                  {s.owner_email ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm capitalize">
                  {s.provider}
                  {s.provider === "linode" && s.linode_id ? (
                    <span className="text-xs text-muted-foreground"> #{s.linode_id}</span>
                  ) : s.vmid ? (
                    <span className="text-xs text-muted-foreground"> vm {s.vmid}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{s.region_label ?? s.location ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{specs(s) || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {s.hourly_cost != null ? `$${Number(s.hourly_cost).toFixed(4)}` : "—"}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={busyId === s.id}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => power(s, "start")} disabled={s.status === "running"}>
                        <Play className="mr-2 h-4 w-4" /> Start
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => power(s, "stop")} disabled={s.status === "stopped"}>
                        <Square className="mr-2 h-4 w-4" /> Stop
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => power(s, "reboot")}>
                        <RotateCw className="mr-2 h-4 w-4" /> Reboot
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {s.ip && (
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(s.ip!);
                            toast.success("IP copied");
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy IP
                        </DropdownMenuItem>
                      )}
                      {s.provider === "linode" && s.linode_id && (
                        <DropdownMenuItem asChild>
                          <a
                            href={`https://cloud.linode.com/linodes/${s.linode_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" /> Open in Linode
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => destroy(s)}
                        className="text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border p-3">
          <span className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
