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
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-white/80 font-semibold">Name</TableHead>
                <TableHead className="text-white/80 font-semibold">Bucket ID</TableHead>
                {/* <TableHead className="text-white/80 font-semibold">Region</TableHead> */}
                <TableHead className="text-white/80 font-semibold">Endpoint</TableHead>
                <TableHead className="text-white/80 font-semibold">Status</TableHead>
              
                <TableHead className="text-white/80 font-semibold text-right">Objects</TableHead>
                <TableHead className="text-white/80 font-semibold text-right">Usage</TableHead>
                
                <TableHead className="text-white/80 font-semibold">Created</TableHead>
                <TableHead className="text-white/80 font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((bucket, index) => (
                <TableRow
                  key={bucket.id}
                  className="border-white/10 hover:bg-white/10 cursor-pointer transition-colors"
                  onClick={() => router.push(`/dashboard/services/object-storage/buckets/${bucket.id}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-white">{bucket.name}</span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-white/70 bg-white/5 px-2 py-1 rounded border border-white/10">
                        {bucket.id}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(bucket.id, "Bucket ID");
                        }}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                      >
                        {copiedId === bucket.id ? (
                          <Check className="h-3 w-3 text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3 text-white/40" />
                        )}
                      </button>
                    </div>
                  </TableCell>

                  {/* <TableCell>
                    <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                      {bucket.region}
                    </Badge>
                  </TableCell> */}

                  <TableCell>
                    {bucket.endpoint ? (
                      <div className="flex items-center gap-2 max-w-md">
                        <code className="text-xs text-white/70 bg-white/5 px-2 py-1 rounded border border-white/10 truncate">
                          {bucket.endpoint}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(bucket.endpoint, "Endpoint");
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                        >
                          {copiedId === bucket.endpoint ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-white/40" />
                          )}
                        </button>
                        <a
                          href={bucket.endpoint}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                        >
                          <ExternalLink className="h-3 w-3 text-white/40" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-white/40 text-xs">-</span>
                    )}
                  </TableCell>

                  <TableCell>
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
                  </TableCell>

                 

                  <TableCell className="text-right">
                    <span className="text-white/80 font-mono text-sm">
                      {bucket.object_count || 0}
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="text-white/80 font-mono text-sm">
                      {((bucket.size_bytes || 0) / 1024).toFixed(2)} KB
                    </span>
                  </TableCell>

                

                  <TableCell>
                    <span className="text-white/70 text-sm">
                      {format(new Date(bucket.created_at), "MMM d, yyyy")}
                    </span>
                    <div className="text-xs text-white/40">
                      {format(new Date(bucket.created_at), "HH:mm:ss")}
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteClick(bucket.id, e)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
