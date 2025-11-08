"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, Archive, Plus, Trash, Ban, Loader2, CheckCircle } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface BucketsTableProps {
  buckets: ObjectSpaceBucket[];
}

const BucketsTable = ({ buckets }: BucketsTableProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const router = useRouter();

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
            className="cursor-pointer group relative inline-flex items-center justify-center px-5 py-2 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
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
        <table className="w-full">
  <thead className="bg-neutral-800/50 border-b border-neutral-800">
    <tr>
      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
        Name
      </th>
      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
        Bucket ID
      </th>
      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
        Status
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
    {buckets.map((bucket) => (
      <tr
        key={bucket.id}
        className="hover:bg-neutral-800/30 transition-colors"
      >
        {/* Name */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <div className="font-medium text-white text-sm truncate">
                {bucket.name}
              </div>
            </div>
          </div>
        </td>

        {/* Bucket ID with Copy */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
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
        </td>

        {/* Status Badge */}
        <td className="px-6 py-4">
          {bucket.status === "active" ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-950/50 text-emerald-400 border border-emerald-900">
              <CheckCircle className="h-3 w-3" />
              Active
            </span>
          ) : bucket.status === "creating" ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-yellow-950/50 text-yellow-400 border border-yellow-900">
              <Loader2 className="h-3 w-3 animate-spin" />
              Creating
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-950/50 text-red-400 border border-red-900">
              <Ban className="h-3 w-3" />
              Error
            </span>
          )}
        </td>

        {/* Created Date */}
        <td className="px-6 py-4 text-sm text-neutral-400">
          <div className="flex flex-col">
            <span>
              {format(new Date(bucket.created_at), "MMM d, yyyy")}
            </span>
            <span className="text-xs text-neutral-600">
              {format(new Date(bucket.created_at), "HH:mm:ss")}
            </span>
          </div>
        </td>

        {/* Actions */}
        <td className="px-6 py-4">
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                router.push(
                  `/dashboard/services/object-storage/${bucket.id}`
                )
              }
              className="cursor-pointer h-8 px-3 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-0"
            >
              View
            </Button>

            <Button
              size="sm"
              variant="ghost"
             // onClick={(e) => }
              className="cursor-pointer h-8 w-8 p-0 bg-red-900/30 hover:bg-red-900/50 text-red-400 border-0"
              title="Delete Bucket"
            >
              <Trash className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    ))}
  </tbody>
</table>

        </div>
      </motion.div>
    </>
  );
};

export default BucketsTable;

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-6 py-4 text-sm text-slate-800 align-middle">
      {children}
    </td>
  );
}
