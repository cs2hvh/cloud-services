"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  Shield,
  ChevronLeft,
  ChevronRight,
  Filter,
  Trash2,
  Eye,
  Edit,
  Loader2,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Admin_SpectrumApp } from "@/lib/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { getErrorMessage } from "@/config/functions";
import axios from "axios";
import { format } from "date-fns";
import Link from "next/link";

interface DDoSUsersTabProps {
  all_apps: Admin_SpectrumApp[];
}

const APPS_PER_PAGE = 10;

export default function DDoSUsersTab({ all_apps }: DDoSUsersTabProps) {
  const router = useRouter();

  const [allAppsLocal, setAllAppsLocal] = useState(all_apps);
  const [apps, setApps] = useState(all_apps.slice(0, APPS_PER_PAGE));
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"email" | "protocol" | "created">("email");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(all_apps.length / APPS_PER_PAGE)
  );

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  // const [selectedAppOrigin, setSelectedAppOrigin] = useState<string>("");
  const [selectedAppName, setSelectedAppName] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter and sort apps
  const getFilteredAndSortedApps = () => {
    let filtered = [...allAppsLocal];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (app) =>
          app.origin_direct[0]?.toLowerCase().includes(query) ||
          app.protocol?.toLowerCase().includes(query) ||
          app.spectrum_id?.toLowerCase().includes(query) ||
          app.owner_email?.toLowerCase().includes(query) ||
          app.owner_username?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === "email") {
        return (a.owner_email || "").localeCompare(b.owner_email || "");
      } else if (sortBy === "protocol") {
        return (a.protocol || "").localeCompare(b.protocol || "");
      } else if (sortBy === "created") {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      return 0;
    });

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredAndSortedApps();
    const startIndex = (page - 1) * APPS_PER_PAGE;
    const endIndex = startIndex + APPS_PER_PAGE;
    const paginatedApps = filtered.slice(startIndex, endIndex);

    setApps(paginatedApps);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / APPS_PER_PAGE));
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleSortChange = (value: "email" | "protocol" | "created") => {
    setSortBy(value);
  };

  const handleViewApp = (spectrumId: string) => {
    router.push(`/dashboard/services/network-ddos/${spectrumId}`);
  };

  const handleEditApp = (spectrumId: string) => {
    router.push(`/dashboard/services/network-ddos/${spectrumId}?tab=settings`);
  };

  const handleDeleteApp = (spectrumId: string, origin: string, appName: string) => {
    setSelectedAppId(spectrumId);
   // setSelectedAppOrigin(origin);
    setDeleteDialogOpen(true);
    setSelectedAppName(appName);
  };

  const confirmDelete = async () => {
    if (!selectedAppId) return;

    try {
      setIsDeleting(true);
      await axios.post("/api/admin/network-ddos/apps/delete", {
        spectrum_id: selectedAppId,
      });

      toast.success("Spectrum app deleted successfully");

      // Remove the deleted app from local state
      const updatedApps = allAppsLocal.filter(
        (app) => app.spectrum_id !== selectedAppId
      );

      // Update local state
      setAllAppsLocal(updatedApps);

      // Apply search filter
      let filtered = [...updatedApps];
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (app) =>
            app.origin_direct[0]?.toLowerCase().includes(query) ||
            app.protocol?.toLowerCase().includes(query) ||
            app.spectrum_id?.toLowerCase().includes(query) ||
            app.owner_email?.toLowerCase().includes(query) ||
            app.owner_username?.toLowerCase().includes(query)
        );
      }

      // Apply sorting
      filtered.sort((a, b) => {
        if (sortBy === "email") {
          return (a.owner_email || "").localeCompare(b.owner_email || "");
        } else if (sortBy === "protocol") {
          return (a.protocol || "").localeCompare(b.protocol || "");
        } else if (sortBy === "created") {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        return 0;
      });

      // Pagination recalculation
      const newTotalPages = Math.ceil(filtered.length / APPS_PER_PAGE);
      let pageToShow = currentPage;

      if (currentPage > newTotalPages && newTotalPages > 0) {
        pageToShow = newTotalPages;
      } else if (newTotalPages === 0) {
        pageToShow = 1;
      }

      const startIndex = (pageToShow - 1) * APPS_PER_PAGE;
      const endIndex = startIndex + APPS_PER_PAGE;
      const paginatedApps = filtered.slice(startIndex, endIndex);

      setApps(paginatedApps);
      setCurrentPage(pageToShow);
      setTotalPages(Math.max(1, newTotalPages));

      // Refresh server data for persistence
      router.refresh();
      setIsDeleting(false);

      // Close dialog after successful deletion
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete spectrum app"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Apply filters and pagination whenever search or sort changes
  useEffect(() => {
    updatePagination(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy]);

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "created":
      case "updated":
        return "bg-emerald-950/50 text-emerald-400 border-emerald-900";
      case "creating":
        return "bg-yellow-950/50 text-yellow-400 border-yellow-900";
      case "failed":
        return "bg-red-950/50 text-red-400 border-red-900";
      default:
        return "bg-neutral-800 text-neutral-400 border-neutral-700";
    }
  };

  return (
    <>
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search by origin IP, protocol, email, spectrum ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:ring-0"
            />
          </div>
          <Button
            onClick={handleSearch}
            className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white border-0"
          >
            Search
          </Button>
        </div>

        <div className="flex gap-3">
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="cursor-pointer w-[180px] bg-neutral-900 border-neutral-800 text-white focus:ring-0">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              <SelectItem
                value="email"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Email
              </SelectItem>
              <SelectItem
                value="protocol"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Protocol
              </SelectItem>
              <SelectItem
                value="created"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Created
              </SelectItem>
            </SelectContent>
          </Select>
          <Link href="/network-ddos/assign">
          <Button
            className="cursor-pointer h-10 px-4 text-sm bg-blue-900/50 hover:bg-blue-800 text-blue-300 border-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Assign DDoS Protection</span>
            <span className="sm:hidden">Assign</span>
          </Button>
          </Link>
        </div>
      </div>

      {/* Apps Table */}
      {isDeleting ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-800/50 border-b border-neutral-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        App name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        Protocol
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        Traffic Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        IP Firewall
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {apps.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center">
                          <Shield className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                          <p className="text-neutral-400 text-sm">
                            No spectrum apps found
                          </p>
                        </td>
                      </tr>
                    ) : (
                      apps.map((app) => (
                        <tr
                          key={app.id}
                          className="hover:bg-neutral-800/30 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="text-sm text-neutral-300">
                              {app.owner_email || (
                                <span className="text-neutral-600">No email</span>
                              )}
                            </div>
                            {app.owner_username && (
                              <div className="text-xs text-neutral-500">
                                @{app.owner_username}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-blue-400" />
                              <div>
                                <div className="font-medium text-white text-sm">
                                  {app?.dns?.original_name || "N/A"}
                                </div>
                                <div className="text-xs text-neutral-500 truncate max-w-[150px]">
                                  {app.spectrum_id}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <code className="text-xs text-white/70 bg-white/5 px-2 py-1 rounded border border-white/10">
                              {app.protocol}
                            </code>
                          </td>

                          <td className="px-6 py-4">
                            <Badge
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                                app.status
                              )}`}
                            >
                              {app.status || "unknown"}
                            </Badge>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-neutral-300">
                              {app.traffic_type}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-neutral-300">
                              {app.ip_firewall ? (
                                <span className="text-emerald-400">✓ Enabled</span>
                              ) : (
                                <span className="text-neutral-500">✗ Disabled</span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="text-sm text-neutral-300">
                              {app.created_at
                                ? format(new Date(app.created_at), "MMM dd, yyyy")
                                : "N/A"}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewApp(app.spectrum_id)}
                                className="cursor-pointer h-8 px-3 text-xs bg-blue-900/50 hover:bg-blue-800 text-blue-300 border-0"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditApp(app.spectrum_id)}
                                className="cursor-pointer h-8 px-3 text-xs bg-yellow-900/50 hover:bg-yellow-800 text-yellow-300 border-0"
                              >
                                <Edit className="h-3.5 w-3.5 mr-1.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  handleDeleteApp(
                                    app.spectrum_id,
                                    app.origin_direct[0] || "Unknown",
                                    app.dns?.original_name || "Unknown"
                                  )
                                }
                                className="cursor-pointer h-8 px-3 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 border-0"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
                  <div className="text-sm text-neutral-400">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updatePagination(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="cursor-pointer h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updatePagination(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="cursor-pointer h-8 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed border-0"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-neutral-900 border-neutral-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Delete Spectrum App
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-300">
              Do you want to permanently delete this spectrum app?
              <span className="mt-3 p-3 bg-neutral-800 rounded-md border border-neutral-700 block">
                <span className="text-sm text-neutral-400 block">
                  App Name:
                </span>
                <span className="text-base font-semibold text-white mt-1 block">
                  {selectedAppName}
                </span>
              </span>
              <span className="mt-3 text-red-400 text-sm font-medium block">
                ⚠️ This action cannot be undone. The app will be deleted from
                Cloudflare and the database.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700"
            >
              No
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="cursor-pointer bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Deleting...
                </>
              ) : (
                "Yes, Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
