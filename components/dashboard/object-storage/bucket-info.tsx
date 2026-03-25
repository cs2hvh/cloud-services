"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Copy, Check, Eye, EyeOff, Key, Trash2, Loader2, HardDrive, Package, Globe2 } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Storage Used</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                {isLoadingStats ? <Loader2 className="h-6 w-6 animate-spin text-white/40" /> : formatBytes(bucketData.size_bytes || 0)}
              </p>
              <p className="mt-1 text-sm text-white/45">Total data stored</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/storage .png" alt="Storage" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Total Objects</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
                {isLoadingStats ? <Loader2 className="h-6 w-6 animate-spin text-white/40" /> : (bucketData.object_count || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-white/45">Files in bucket</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/documents .png" alt="Objects" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </div>

        <div className="glass-panel p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Access Control</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-white capitalize">
                {bucketData.acl === "public-read" ? "Public" : "Private"}
              </p>
              <p className="mt-1 text-sm text-white/45">{bucketData.acl === "public-read" ? "Public read access" : "Private access only"}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <Image src="/dashboard icons/public acess .png" alt="Access" width={44} height={44} className="h-11 w-11 object-contain" />
            </div>
          </div>
        </div>
      </div>

      {/* Endpoint + Keys panel */}
      <div className="glass-panel overflow-hidden">
        <div className="border-b border-white/[0.06] px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Connection</p>
          <h3 className="mt-1.5 text-lg font-semibold text-white">Endpoint & Access Keys</h3>
        </div>

        <div className="divide-y divide-white/[0.05] px-6">
          {/* Endpoint */}
          <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Endpoint</p>
              <p className="mt-0.5 text-xs text-white/45">S3-compatible endpoint for your bucket</p>
            </div>
            <div className="flex items-center gap-2">
              {isLoadingStats ? (
                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              ) : (
                <>
                  <code className="max-w-xs truncate border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-white/80">
                    {bucketData.endpoint || "—"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(bucketData.endpoint || "", "Endpoint")}
                    disabled={!bucketData.endpoint}
                    className="h-8 w-8 cursor-pointer hover:bg-white/10"
                  >
                    {copiedItem === "Endpoint" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Access Key ID */}
          <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Access Key ID</p>
              <p className="mt-0.5 text-xs text-white/45">Public identifier for S3 authentication</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="max-w-xs truncate border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-white/80">
                {showKeyId ? (bucketData.key_id || "Not available") : "••••••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowKeyId(!showKeyId)}
                className="h-8 w-8 cursor-pointer hover:bg-white/10"
              >
                {showKeyId ? <EyeOff className="h-3.5 w-3.5 text-white/50" /> : <Eye className="h-3.5 w-3.5 text-white/50" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(bucketData.key_id || "", "Access Key ID")}
                disabled={!bucketData.key_id}
                className="h-8 w-8 cursor-pointer hover:bg-white/10"
              >
                {copiedItem === "Access Key ID" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
              </Button>
            </div>
          </div>

          {/* Secret Key */}
          <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Secret Access Key</p>
              <p className="mt-0.5 text-xs text-white/45">Secret key for S3 authentication — keep private</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="max-w-xs truncate border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-white/80">
                {showSecretKey ? (bucketData.secret_key || "Not available") : "••••••••••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="h-8 w-8 cursor-pointer hover:bg-white/10"
              >
                {showSecretKey ? <EyeOff className="h-3.5 w-3.5 text-white/50" /> : <Eye className="h-3.5 w-3.5 text-white/50" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(bucketData.secret_key || "", "Secret Access Key")}
                disabled={!bucketData.secret_key}
                className="h-8 w-8 cursor-pointer hover:bg-white/10"
              >
                {copiedItem === "Secret Access Key" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-white/50" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <Key className="h-4 w-4 shrink-0 text-amber-300" />
            <p className="text-xs text-amber-300/85">Keep credentials secure. Never expose them in client-side code or commit to version control.</p>
          </div>
        </div>
      </div>

      {/* Bucket metadata */}
      <div className="glass-panel overflow-hidden">
        <div className="border-b border-white/[0.06] px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Bucket Details</p>
          <h3 className="mt-1.5 text-lg font-semibold text-white">Configuration Overview</h3>
        </div>
        <div className="grid gap-0 divide-y divide-white/[0.05] px-6 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="py-4 sm:pr-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-white/42">Bucket Name</span>
                <span className="text-sm font-medium text-white/88">{bucketData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/42">Region</span>
                <span className="text-sm font-medium text-white/88">{bucketData.region || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/42">Status</span>
                <span className={`text-sm font-medium capitalize ${bucketData.status === "active" ? "text-emerald-300" : "text-amber-300"}`}>{bucketData.status || "active"}</span>
              </div>
            </div>
          </div>
          <div className="py-4 sm:pl-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-white/42">CORS</span>
                <span className={`text-sm font-medium ${bucketData.cors_enabled ? "text-emerald-300" : "text-white/50"}`}>{bucketData.cors_enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/42">Versioning</span>
                <span className={`text-sm font-medium ${bucketData.versioning_enabled ? "text-violet-300" : "text-white/50"}`}>{bucketData.versioning_enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/42">Type</span>
                <span className="text-sm font-medium text-white/88">S3-Compatible</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API Docs */}
      <Documentation />

      {/* Danger zone */}
      <div className="glass-panel overflow-hidden border border-red-500/10">
        <div className="border-b border-red-500/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-400/60">Danger Zone</p>
          <h3 className="mt-1.5 text-lg font-semibold text-white">Destructive Actions</h3>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Delete Bucket</p>
            <p className="mt-0.5 text-sm text-white/45">Permanently delete this bucket and all objects within it. This cannot be undone.</p>
          </div>
          <Button
            onClick={handleDeleteClick}
            className="cursor-pointer border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 shrink-0"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Bucket
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bucket?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the bucket &quot;{bucketData.name}&quot; and all files inside it.
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
                "Delete Bucket"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SingleBucket;
