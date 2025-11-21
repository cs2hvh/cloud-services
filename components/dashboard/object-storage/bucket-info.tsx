"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Copy, Check, Database, HardDrive, Eye, EyeOff, Key, Link as LinkIcon, Archive,  Trash2, Loader2 } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import Documentation from "./api-docs";
import { getErrorMessage } from "@/config/functions";

interface SingleBucketProps {
  bucket: ObjectSpaceBucket;
}

const SingleBucket = ({ bucket }: SingleBucketProps) => {
  const router = useRouter();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showKeyId, setShowKeyId] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bucketData, setBucketData] = useState<ObjectSpaceBucket>(bucket);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Fetch live bucket stats on mount
  useEffect(() => {
    const fetchBucketStats = async () => {
      try {
        setIsLoadingStats(true);
        const response = await axios.post("/api/services/object-storage/buckets/read", {
          bucket_id: bucket.id,
        });
        
        if (response.data.success && response.data.data) {
          setBucketData(response.data.data);
        }
      } catch (error) {
        console.error("Error fetching bucket stats:", error);
        // Keep using the initial bucket data if fetch fails
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchBucketStats();
  }, [bucket.id]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedItem(null), 2000);
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

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const toastId = toast.loading("Deleting bucket...");

      await axios.post("/api/services/object-storage/buckets/delete", {
        bucket_id: bucket.id,
      });

      toast.success("Bucket deleted successfully", { id: toastId });
      router.push("/dashboard/services/object-storage");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete bucket"));
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
     

      {/* Show Access Keys Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
        <div className="flex gap-2 justify-start">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="text-xs sm:text-sm lg:text-base cursor-pointer bg-white/10 hover:bg-white/20 text-white border border-white/20 w-full sm:w-auto">
                  <Key className="h-4 w-4 mr-2" />
                  Show Access Keys
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-black border-white/20 text-white max-w-[95vw] sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="text-white">Access Keys</DialogTitle>
                  <DialogDescription className="text-white/60">
                    Use these credentials to access your bucket
                    programmatically.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                  {/* Key ID */}
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 font-medium">
                      Access Key ID
                    </label>
                    <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
                      <div className="flex-1 relative min-w-0">
                        <code className="block w-full text-xs sm:text-sm text-white/80 bg-white/5 px-3 sm:px-4 py-2 sm:py-3 rounded border border-white/10 font-mono pr-10 sm:pr-12 break-all">
                          {showKeyId
                            ? bucketData.key_id || "Not available"
                            : "••••••••••••••••"}
                        </code>
                        <button
                          onClick={() => setShowKeyId(!showKeyId)}
                          className="cursor-pointer absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          {showKeyId ? (
                            <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/50" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/50" />
                          )}
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(bucketData.key_id || "", "Access Key ID")
                        }
                        disabled={!bucketData.key_id}
                        className="cursor-pointer hover:bg-white/10 transition-colors flex-shrink-0"
                      >
                        {copiedItem === "Access Key ID" ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-white/50" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Secret Key */}
                  <div className="space-y-2">
                    <label className="text-sm text-white/70 font-medium">
                      Secret Access Key
                    </label>
                    <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
                      <div className="flex-1 relative min-w-0">
                        <code className="block w-full text-xs sm:text-sm text-white/80 bg-white/5 px-3 sm:px-4 py-2 sm:py-3 rounded border border-white/10 font-mono pr-10 sm:pr-12 break-all">
                          {showSecretKey
                            ? bucketData.secret_key || "Not available"
                            : "••••••••••••••••••••••••••••••••"}
                        </code>
                        <button
                          onClick={() => setShowSecretKey(!showSecretKey)}
                          className="cursor-pointer absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          {showSecretKey ? (
                            <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/50" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/50" />
                          )}
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(
                            bucketData.secret_key || "",
                            "Secret Access Key"
                          )
                        }
                        disabled={!bucketData.secret_key}
                        className="cursor-pointer hover:bg-white/10 transition-colors flex-shrink-0"
                      >
                        {copiedItem === "Secret Access Key" ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-white/50" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <p className="text-yellow-400/90 text-sm">
                      ⚠️ Keep these credentials secure. Never share them
                      publicly or commit them to version control.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </motion.div>
        </div>
         {isLoadingStats ? (
        <Loader2 className="h-6 w-6 text-white/50 animate-spin" />
      ) : (
        <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto">
          <Button className="cursor-pointer bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs sm:text-sm max-w-full truncate">
            <span className="truncate block max-w-[200px] sm:max-w-full">{bucketData.endpoint}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => copyToClipboard(bucketData.endpoint || "", "Endpoint")}
            disabled={!bucketData.endpoint}
            className="cursor-pointer hover:bg-white/10 transition-colors flex-shrink-0"
          >
            {copiedItem === "Endpoint" ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4 text-white/50" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDeleteClick}
            className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150 flex-shrink-0"
          >
            <Trash2 className="cursor-pointer h-4 w-4" />
          </Button>
        </div>
      )}
      </div>

      {/* Stats - Usage and Object Count */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8"
      >
        {/* Usage Box */}
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-white/60 text-xs sm:text-sm mb-1">Storage Usage</p>
                <p className="text-2xl sm:text-3xl font-bold text-white truncate">
                  {isLoadingStats ? (
                    <Loader2 className="h-8 w-8 animate-spin inline" />
                  ) : (
                    formatBytes(bucketData.size_bytes || 0)
                  )}
                </p>
              </div>
              <div className="h-12 w-12 sm:h-16 sm:w-16 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
                <HardDrive className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Object Count Box */}
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-white/60 text-xs sm:text-sm mb-1">Total Objects</p>
                <p className="text-2xl sm:text-3xl font-bold text-white truncate">
                  {isLoadingStats ? (
                    <Loader2 className="h-8 w-8 animate-spin inline" />
                  ) : (
                    (bucketData.object_count || 0).toLocaleString()
                  )}
                </p>
              </div>
              <div className="h-12 w-12 sm:h-16 sm:w-16 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
                <Database className="h-6 w-6 sm:h-8 sm:w-8 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Documentation />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bucket?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the bucket "{bucketData.name}" and all files inside it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="cursor-pointer bg-red-500 hover:bg-red-600"
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

export default SingleBucket;
