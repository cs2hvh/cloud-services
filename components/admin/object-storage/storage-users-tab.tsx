"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Search,
  Archive,
  ChevronLeft,
  ChevronRight,
  Filter,
  Trash2,
  Plus,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Admin_Bucket } from "@/lib/supabase/types";
import { DO_SPACES_REGION_NAMES } from "@/lib/validation/object-storage";
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

interface StorageUsersTabProps {
  all_buckets: Admin_Bucket[];
}

const BUCKETS_PER_PAGE = 10;

export default function StorageUsersTab({ all_buckets }: StorageUsersTabProps) {
  const router = useRouter();

  const [allBucketLocal, setAllBucketLocal] = useState(all_buckets);
  const [buckets, setBuckets] = useState(
    all_buckets.slice(0, BUCKETS_PER_PAGE)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"email" | "region" | "created">("email");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(all_buckets.length / BUCKETS_PER_PAGE)
  );

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState<string>("");
  const [selectedBucketName, setSelectedBucketName] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter and sort buckets
  const getFilteredAndSortedBuckets = () => {
    let filtered = [...all_buckets];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (bucket) =>
          bucket.name?.toLowerCase().includes(query) ||
          (bucket.region && DO_SPACES_REGION_NAMES[bucket.region]?.toLowerCase().includes(query)) ||
          bucket.id?.toLowerCase().includes(query) ||
          bucket.owner_email?.toLowerCase().includes(query) ||
          bucket.owner_username?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === "email") {
        return (a.owner_email || "").localeCompare(b.owner_email || "");
      } else if (sortBy === "region") {
        return (a.region || "").localeCompare(b.region || "");
      }
      return 0;
    });

    return filtered;
  };

  const updatePagination = (page: number) => {
    const filtered = getFilteredAndSortedBuckets();
    const startIndex = (page - 1) * BUCKETS_PER_PAGE;
    const endIndex = startIndex + BUCKETS_PER_PAGE;
    const paginatedBuckets = filtered.slice(startIndex, endIndex);

    setBuckets(paginatedBuckets);
    setCurrentPage(page);
    setTotalPages(Math.ceil(filtered.length / BUCKETS_PER_PAGE));
  };

  const handleSearch = () => {
    updatePagination(1);
  };

  const handleSortChange = (value: "email" | "region" | "created") => {
    setSortBy(value);
  };

  // const handleViewBucket = (bucketId: string) => {
  //   router.push(`/dashboard/services/object-storage/${bucketId}`);
  // };

  const handleDeleteBucket = (bucketId: string, bucketName: string) => {
    setSelectedBucketId(bucketId);
    setSelectedBucketName(bucketName);
    setDeleteDialogOpen(true);
    //setSelectedBucketOwnerId(bucketOwnerId);
  };

  const confirmDelete = async () => {
    if (!selectedBucketId) return;

    

    try {
      setIsDeleting(true);
      await axios.post("/api/services/object-storage/buckets/delete", {
        bucket_id: selectedBucketId,
        is_admin: true,
      });

      toast.success("Bucket deleted successfully");

      // Remove the deleted bucket from local state
      const updatedBuckets = allBucketLocal.filter(
        (bucket) => bucket.id !== selectedBucketId
      );

      // Update local state
      setAllBucketLocal(updatedBuckets);
      //setDeleteDialogOpen(false);

      // Apply search filter
      let filtered = [...updatedBuckets];
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (bucket) =>
            bucket.name?.toLowerCase().includes(query) ||
            bucket.region?.toLowerCase().includes(query) ||
            bucket.id?.toLowerCase().includes(query) ||
            bucket.owner_email?.toLowerCase().includes(query) ||
            bucket.owner_username?.toLowerCase().includes(query)
        );
      }

      // Apply sorting
      filtered.sort((a, b) => {
        if (sortBy === "email") {
          return (a.owner_email || "").localeCompare(b.owner_email || "");
        } else if (sortBy === "region") {
          return (a.region || "").localeCompare(b.region || "");
        }
        return 0;
      });

      // Pagination recalculation
      const newTotalPages = Math.ceil(filtered.length / BUCKETS_PER_PAGE);
      let pageToShow = currentPage;

      if (currentPage > newTotalPages && newTotalPages > 0) {
        pageToShow = newTotalPages;
      } else if (newTotalPages === 0) {
        pageToShow = 1;
      }

      const startIndex = (pageToShow - 1) * BUCKETS_PER_PAGE;
      const endIndex = startIndex + BUCKETS_PER_PAGE;
      const paginatedBuckets = filtered.slice(startIndex, endIndex);

      setBuckets(paginatedBuckets);
      setCurrentPage(pageToShow);
      setTotalPages(Math.max(1, newTotalPages));

      // Refresh server data for persistence
      router.refresh();
      setIsDeleting(false);
      
      // Close dialog after successful deletion
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete bucket"));
    } finally {
      setIsDeleting(false);
    }
  };


  // Apply filters and pagination whenever search or sort changes
  useEffect(() => {
    updatePagination(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-950/50 text-emerald-400 border-emerald-900";
      case "creating":
        return "bg-yellow-950/50 text-yellow-400 border-yellow-900";
      case "deleting":
        return "bg-red-950/50 text-red-400 border-red-900";
      case "failed":
        return "bg-red-950/50 text-red-400 border-red-900";
      default:
        return "bg-neutral-800 text-neutral-400 border-neutral-700";
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <>
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search by name, bucket ID, owner email..."
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
                value="region"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Region
              </SelectItem>
              {/* <SelectItem
                value="created"
                className="text-white focus:bg-neutral-800 focus:text-white"
              >
                Sort by Created
              </SelectItem> */}
            </SelectContent>
          </Select>
          <Button
            onClick={() =>
              router.push("/dashboard/admin/object-storage/assign")
            }
            className="cursor-pointer h-8 px-3 text-xs bg-blue-900/50 hover:bg-blue-800 text-blue-300 border-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Assign Storage</span>
            <span className="sm:hidden">Assign</span>
          </Button>
        </div>
      </div>

      {/* Buckets Table */}
     {
      isDeleting?       <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>:
      ( <>
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
                    Bucket Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Objects
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Region
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {buckets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <Archive className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400 text-sm">
                        No buckets found
                      </p>
                    </td>
                  </tr>
                ) : (
                  buckets.map((bucket) => (
                    <tr
                      key={bucket.id}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {bucket.owner_email || (
                            <span className="text-neutral-600">No email</span>
                          )}
                        </div>
                        {bucket.owner_username && (
                          <div className="text-xs text-neutral-500">
                            @{bucket.owner_username}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Archive className="h-4 w-4 text-neutral-500" />
                          <div>
                            <div className="font-medium text-white text-sm">
                              {bucket.name}
                            </div>
                            <div className="text-xs text-neutral-500 truncate max-w-[150px]">
                              {bucket.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {formatBytes(bucket.size || 0)}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {(bucket.object_count || 0).toLocaleString()}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-300">
                          {(bucket.region && DO_SPACES_REGION_NAMES[bucket.region]) || bucket.region || (
                            <span className="text-neutral-600">N/A</span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                            bucket.status
                          )}`}
                        >
                          {bucket.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleDeleteBucket(
                                bucket.id,
                                bucket.name
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
      )
     }

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-neutral-900 border-neutral-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-400" />
              Delete Storage Bucket
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-300">
              Do you want to permanently delete this bucket?
              <span className="mt-3 p-3 bg-neutral-800 rounded-md border border-neutral-700 block">
                <span className="text-sm text-neutral-400 block">
                  Bucket Name:
                </span>
                <span className="text-base font-semibold text-white mt-1 block">
                  {selectedBucketName}
                </span>
              </span>
              <span className="mt-3 text-red-400 text-sm font-medium block">
                ⚠️ This action cannot be undone. Buckets in use cannot be
                deleted.
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
