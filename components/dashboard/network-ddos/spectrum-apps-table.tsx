"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Eye, Trash, Network, Plus, Shield, CheckCircle, Loader2, AlertTriangle, Globe } from "lucide-react";
import { Tables } from "@/lib/supabase/types";
// import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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

interface SpectrumAppsTableProps {
  spectrumApps: Tables<"spectrum_apps">[];
  userId: string;
}

const SpectrumAppsTable = ({ spectrumApps, userId }: SpectrumAppsTableProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDeleteClick = (spectrumId: string) => {
    setSelectedAppId(spectrumId);
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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete spectrum app");
      }

      toast.success("Spectrum app deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedAppId(null);
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete spectrum app");
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper function to get DNS name from Json
  // const getDnsName = (dns: unknown): string => {
  //   if (dns && typeof dns === "object" && "name" in dns) {
  //     // DNS name is encrypted, we'll show a placeholder or spectrum_id
  //     return "[Encrypted]";
  //   }
  //   return "N/A";
  // };

  // Helper function to get status badge
  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "created":
      case "updated":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-950/50 text-emerald-400 border border-emerald-900">
            <CheckCircle className="h-3 w-3" />
            Active
          </span>
        );
      case "creating":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-yellow-950/50 text-yellow-400 border border-yellow-900">
            <Loader2 className="h-3 w-3 animate-spin" />
            Creating
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-950/50 text-gray-400 border border-gray-900">
            <AlertTriangle className="h-3 w-3" />
            {status || "Unknown"}
          </span>
        );
    }
  };

  if (spectrumApps.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-neutral-900 border border-neutral-800 border-dashed rounded-lg"
      >
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-3 bg-neutral-800 rounded-lg mb-4">
            <Network className="h-8 w-8 text-neutral-500" />
          </div>
          <h3 className="text-base font-medium text-white mb-2">No Protected Applications</h3>
          <p className="text-sm text-neutral-400 text-center mb-6 max-w-md">
            Configure your first Layer 4 reverse proxy to protect and optimize your TCP/UDP applications.
          </p>
          <Button asChild className="bg-neutral-800 hover:bg-neutral-700 text-white border-0">
            <Link href="/dashboard/services/network-ddos/new">
              <Plus className="h-4 w-4 mr-2" />
              Enable Protection
            </Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden"
      >
        <div className="overflow-x-auto">
         {
          isDeleting?
          <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
          :
           <table className="w-full">
            <thead className="bg-neutral-800/50 border-b border-neutral-800">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                 Name
                </th>
                 <th className="hidden lg:table-cell px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  App Type
                </th>
                <th className="hidden md:table-cell px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Protocol
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="hidden lg:table-cell px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Traffic Type
                </th>
                <th className="hidden xl:table-cell px-4 sm:px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  IP Firewall
                </th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-800">
              {spectrumApps.map((app) => (
                <tr
                  key={app.id}
                  className="hover:bg-neutral-800/30 transition-colors"
                >
                  {/* Origin IP */}
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-white text-sm truncate">
                          {app.dns.original_name}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          {app.spectrum_id}
                        </div>
                      </div>
                    </div>
                  </td>

                   <td className="hidden md:table-cell px-4 sm:px-6 py-4">
                    <code className="text-xs text-white/70 bg-white/5 px-2 py-1 rounded border border-white/10">
                      {app.dns.original_protocol}
                    </code>
                  </td>

                  {/* Protocol - Hidden on mobile */}
                  <td className="hidden md:table-cell px-4 sm:px-6 py-4">
                    <code className="text-xs text-white/70 bg-white/5 px-2 py-1 rounded border border-white/10">
                      {app.protocol}
                    </code>
                  </td>

                  {/* Status */}
                  <td className="px-4 sm:px-6 py-4">
                    {getStatusBadge(app.status)}
                  </td>

                  {/* Traffic Type - Hidden on tablet and below */}
                  <td className="hidden lg:table-cell px-4 sm:px-6 py-4 text-sm text-neutral-400">
                    <span className="capitalize">
                      {app.traffic_type || "direct"}
                    </span>
                  </td>

                  {/* IP Firewall - Hidden on large and below */}
                  <td className="hidden xl:table-cell px-4 sm:px-6 py-4">
                    {app.ip_firewall ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-950/50 text-blue-400 border border-blue-900">
                        <Shield className="h-3 w-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500">Disabled</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer h-8 px-2 sm:px-3 hover:bg-neutral-700"
                        asChild
                      >
                        <Link
                          href={`/dashboard/services/network-ddos/${app.spectrum_id}`}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">View</span>
                        </Link>
                      </Button>
                     
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer h-8 px-2 sm:px-3 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                          onClick={() => handleDeleteClick(app.spectrum_id)}
                        >
                          <Trash className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">Delete</span>
                        </Button>
                    
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

             
          </table>
         }
        </div>

        {/* Mobile-friendly info cards for hidden columns */}
        <div className="md:hidden border-t border-neutral-800 p-4 bg-neutral-800/20">
          <p className="text-xs text-neutral-500 mb-2">
            View full details on larger screens
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-neutral-400">Protocol</span>
            <span className="text-xs text-neutral-400">•</span>
            <span className="text-xs text-neutral-400">Traffic Type</span>
            <span className="text-xs text-neutral-400">•</span>
            <span className="text-xs text-neutral-400">IP Firewall</span>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-neutral-900 border-neutral-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Spectrum Application?</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              This action cannot be undone. This will permanently delete the
              spectrum application and remove all associated protection rules
              from Cloudflare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="cursor-pointer bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
