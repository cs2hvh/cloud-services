"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Trash2, Lock, Unlock, Loader2, ExternalLink, Copy, Check, Archive, Plus } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import axios from "axios";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface BucketsTableProps {
  buckets: ObjectSpaceBucket[];
}

const BucketsTable = ({ buckets }: BucketsTableProps) => {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleDeleteClick = (bucketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`${type} copied to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-white/10 rounded-lg bg-white/5 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <Table className="w-full border border-white/10 rounded-xl overflow-hidden">
            <TableHeader className="bg-white/5 backdrop-blur-md">
              <TableRow>
                <TableHead className="text-white/90 font-semibold py-3 px-4">
                  Name
                </TableHead>
                <TableHead className="text-white/90 font-semibold py-3 px-4">
                  Bucket ID
                </TableHead>
                <TableHead className="text-white/90 font-semibold py-3 px-4">
                  Status
                </TableHead>
                <TableHead className="text-white/90 font-semibold py-3 px-4">
                  Created
                </TableHead>
                <TableHead className="text-white/90 font-semibold py-3 px-4 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {buckets.map((bucket) => (
                <TableRow
                  key={bucket.id}
                  className="group border-t border-white/10 hover:bg-white/10 transition-all duration-150 cursor-pointer"
                  onClick={() =>
                    router.push(
                      `/dashboard/services/object-storage/buckets/${bucket.id}`
                    )
                  }
                >
                  {/* Name */}
                  <TableCell className="py-3 px-4 font-medium text-white flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-white/30 group-hover:bg-white/50 transition" />
                      <span>{bucket.name}</span>
                    </div>
                  </TableCell>

                  {/* Bucket ID with Copy */}
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center">
                      <code className="text-xs text-white/70 bg-white/5 px-2 py-1 rounded border border-white/10">
                        {bucket.id}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(bucket.id, "Bucket ID");
                        }}
                        className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                      >
                        {copiedId === bucket.id ? (
                          <Check className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-white/50" />
                        )}
                      </button>
                    </div>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell className="py-3 px-4">
                    <Badge
                      variant="secondary"
                      className={`text-xs capitalize px-2.5 py-1.5 rounded-full font-medium tracking-wide
              ${
                bucket.status === "active"
                  ? "bg-green-500/20 text-green-400"
                  : bucket.status === "creating"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
              }
            `}
                    >
                      {bucket.status}
                    </Badge>
                  </TableCell>

                  {/* Created Date */}
                  <TableCell className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="text-white/80 text-sm">
                        {format(new Date(bucket.created_at), "MMM d, yyyy")}
                      </span>
                      <span className="text-white/40 text-xs">
                        {format(new Date(bucket.created_at), "HH:mm:ss")}
                      </span>
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteClick(bucket.id, e)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </motion.div>

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

export default BucketsTable;
