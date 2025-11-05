"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { HardDrive, Trash2, MoreVertical, MapPin, Lock, Unlock, Archive, Plus, Loader2 } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import axios from "axios";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface BucketsListProps {
  buckets: ObjectSpaceBucket[];
}

const BucketsList = ({ buckets }: BucketsListProps) => {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (bucketId: string) => {
    setSelectedBucketId(bucketId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedBucketId) return;

    setIsDeleting(true);
    try {
      const toastId = toast.loading("Deleting bucket...");
      
      await axios.post("/api/services/object-storage/buckets/delete", {
        bucket_id: selectedBucketId,
      });

      toast.success("Bucket deleted successfully", { id: toastId });
      router.refresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to delete bucket");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setSelectedBucketId(null);
    }
  };


  if (buckets.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12 border border-white/10 rounded-lg bg-white/5"
      >
        <Archive className="mx-auto h-12 w-12 text-white/20" />
        <h3 className="mt-4 text-lg font-semibold">No buckets</h3>
        <p className="mt-2 text-sm text-white/60">
          Get started by creating your first bucket.
        </p>
        <div className="mt-6">
            <Link
              href="/dashboard/services/object-storage/new"
              className="group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Create Bucket
            </Link>
          </div>
      </motion.div>
    );
  }

  return (
    <>

    
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {buckets.map((bucket, index) => (
          <motion.div
            key={bucket.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="border border-white/10 rounded-lg p-6 bg-white/5 hover:bg-white/10 transition-colors group relative"
          >
            <Link
              href={`/dashboard/services/object-storage/buckets/${bucket.id}`}
              className="absolute inset-0 z-0"
            />

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-white/60" />
                  <h3 className="text-lg font-semibold truncate">{bucket.name}</h3>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button className="p-2 hover:bg-white/10 rounded transition-colors">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(bucket.id);
                      }}
                      className="text-red-400 focus:text-red-400"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Bucket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                {/* ID & Status Row */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-white/40">ID:</span>
                    <p className="text-white/80 truncate font-mono">{bucket.id}</p>
                  </div>
                  <div>
                    <span className="text-white/40">Status:</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          bucket.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                          bucket.status === 'creating' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {bucket.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Usage Stats Row */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-white/40">Objects:</span>
                    <p className="text-white/80 font-semibold">{bucket.object_count || 0}</p>
                  </div>
                  <div>
                    <span className="text-white/40">Usage:</span>
                    <p className="text-white/80 font-semibold">
                      {((bucket.size_bytes || 0) / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>

                {/* Access Control */}
                <div className="flex items-center gap-2 text-sm">
                  {bucket.acl === "public-read" ? (
                    <>
                      <Unlock className="h-4 w-4 text-blue-400" />
                      <span className="text-white/60">Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 text-green-400" />
                      <span className="text-white/60">Private</span>
                    </>
                  )}
                </div>

                {/* Features Badges */}
                <div className="flex flex-wrap gap-2">
                  {bucket.cors_enabled && (
                    <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                      CORS
                    </Badge>
                  )}
                  {bucket.versioning_enabled && (
                    <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">
                      Versioning
                    </Badge>
                  )}
                </div>

                {/* Endpoint URL */}
                {bucket.endpoint && (
                  <div className="text-xs">
                    <span className="text-white/40">Endpoint:</span>
                    <p className="text-white/60 truncate font-mono text-[10px] mt-1">
                      {bucket.endpoint}
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-white/10 text-xs text-white/60">
                  Created {formatDistanceToNow(new Date(bucket.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bucket?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the bucket and all files inside it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600"
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

export default BucketsList;
