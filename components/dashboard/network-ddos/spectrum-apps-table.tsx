"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Globe,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tables } from "@/lib/supabase/types";

type SpectrumApp = Tables<"spectrum_apps">;

interface SpectrumAppsTableProps {
  spectrumApps: SpectrumApp[];
  userId: string;
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "created" || status === "updated") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Active
      </span>
    );
  }

  if (status === "creating") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Creating
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/60">
      <AlertTriangle className="h-3.5 w-3.5" />
      {status || "Unknown"}
    </span>
  );
}

function getDnsFields(app: SpectrumApp) {
  const dns = (app.dns ?? {}) as {
    original_name?: string;
    original_protocol?: string;
  };

  return {
    name: dns.original_name || "Untitled app",
    edgeProtocol: dns.original_protocol || "n/a",
  };
}

const SpectrumAppsTable = ({ spectrumApps, userId }: SpectrumAppsTableProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const apps = useMemo(
    () => [...spectrumApps].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [spectrumApps],
  );

  const handleDeleteClick = (spectrumId: string, id: string) => {
    setSelectedAppId(spectrumId);
    setSelectedId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedAppId) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/services/spectrum/apps/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_id: selectedAppId,
          owner_id: userId,
          id: selectedId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete spectrum app");
      }

      toast.success("Spectrum app deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedAppId(null);
      setSelectedId(null);
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete spectrum app");
    } finally {
      setIsDeleting(false);
    }
  };

  if (apps.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-dashed border-white/[0.1] bg-white/[0.02]"
      >
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center border border-white/[0.08] bg-white/[0.04] text-blue-300">
            <Shield className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-white">No protected applications yet</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/45">
            Configure your first Spectrum application to protect and route Layer 4 traffic
            without adding operational clutter.
          </p>
          <Link
            href="/dashboard/services/network-ddos/new"
            className="mt-6 inline-flex items-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Protect Application
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {isDeleting ? (
          <div className="flex h-48 items-center justify-center border border-white/[0.08] bg-white/[0.02]">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        ) : (
          <div className="overflow-hidden border border-white/[0.08] bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.08]">
                <thead className="bg-white/[0.04]">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">
                      Application
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">
                      Edge
                    </th>
                    <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 md:table-cell sm:px-5">
                      Origin
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">
                      Status
                    </th>
                    <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 lg:table-cell sm:px-5">
                      Controls
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {apps.map((app) => {
                    const dns = getDnsFields(app);

                    return (
                      <tr key={app.id} className="transition-colors hover:bg-white/[0.04]">
                        <td className="px-4 py-4 sm:px-5">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-blue-300">
                              <Globe className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">
                                {dns.name}
                              </div>
                              <div className="mt-1 truncate font-mono text-xs text-white/35">
                                {app.spectrum_id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 sm:px-5">
                          <span className="inline-flex rounded border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/72">
                            {dns.edgeProtocol}
                          </span>
                        </td>
                        <td className="hidden px-4 py-4 md:table-cell sm:px-5">
                          <div className="flex flex-col gap-1 text-sm text-white/72">
                            <span className="capitalize">{app.protocol || "n/a"}</span>
                            <span className="text-xs text-white/35">{app.traffic_type || "direct"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 sm:px-5">
                          <StatusBadge status={app.status} />
                        </td>
                        <td className="hidden px-4 py-4 lg:table-cell sm:px-5">
                          <div className="flex flex-wrap gap-2">
                            <span className={
                              "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium " +
                              (app.ip_firewall
                                ? "border-blue-500/20 bg-blue-500/10 text-blue-200"
                                : "border-white/10 bg-white/[0.05] text-white/45")
                            }>
                              Firewall {app.ip_firewall ? "On" : "Off"}
                            </span>
                            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium capitalize text-white/55">
                              Proxy {app.proxy_protocol || "off"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 sm:px-5">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 border border-white/[0.1] bg-white/[0.03] px-3 text-white/80 hover:bg-white/[0.08]"
                              asChild
                            >
                              <Link href={"/dashboard/services/network-ddos/" + app.spectrum_id}>
                                <Eye className="h-4 w-4" />
                                <span className="ml-1 hidden sm:inline">View</span>
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 border border-red-500/20 bg-red-500/5 px-3 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                              onClick={() => handleDeleteClick(app.spectrum_id, app.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="ml-1 hidden sm:inline">Delete</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-white/[0.08] px-4 py-3 text-xs text-white/40 sm:px-5 md:hidden">
              Open a record to view all routing and protection details.
            </div>
          </div>
        )}
      </motion.div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-white/[0.08] bg-[#0d0d0f] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete protected application?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This removes the Spectrum application and associated Layer 4 protection
              from Cloudflare. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SpectrumAppsTable;
