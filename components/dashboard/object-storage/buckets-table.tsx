"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Archive,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ObjectSpaceBucket } from "@/lib/supabase/types";

interface BucketsTableProps {
  buckets: ObjectSpaceBucket[];
}

function formatSize(bytes: number | null | undefined) {
  const value = bytes || 0;
  if (value === 0) return "0 KB";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(2) + " KB";
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + " MB";
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") {
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300">
      <Ban className="h-3.5 w-3.5" />
      {status || "Error"}
    </span>
  );
}

const BucketsTable = ({ buckets }: BucketsTableProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const rows = useMemo(
    () => [...buckets].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [buckets],
  );

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(type + " copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (rows.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-dashed border-white/[0.1] bg-white/[0.02]"
      >
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center border border-white/[0.08] bg-white/[0.04] text-blue-300">
            <Archive className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-white">No buckets yet</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/45">
            Create your first object storage bucket to store files, static assets, and
            application data without operational clutter.
          </p>
          <Link
            href="/dashboard/services/object-storage/new"
            className="mt-6 inline-flex items-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Create Bucket
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="overflow-hidden border border-white/[0.08] bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/[0.08]">
            <thead className="bg-white/[0.04]">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">Bucket</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">Region</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 md:table-cell sm:px-5">Access</th>
                <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 lg:table-cell sm:px-5">Usage</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">Status</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:px-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((bucket) => (
                <tr key={bucket.id} className="transition-colors hover:bg-white/[0.04]">
                  <td className="px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center border border-white/[0.08] bg-white/[0.05] text-blue-300">
                        <Archive className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{bucket.name}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <code className="truncate rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/60">
                            {bucket.id}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(bucket.id || "", "Bucket ID")}
                            className="rounded p-1.5 transition-colors hover:bg-white/[0.08]"
                          >
                            {copiedId === bucket.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-300" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-white/45" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-white/72 sm:px-5">{bucket.region || "N/A"}</td>
                  <td className="hidden px-4 py-4 md:table-cell sm:px-5">
                    <div className="flex flex-wrap gap-2">
                      <span className={
                        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium " +
                        (bucket.acl === "public-read"
                          ? "border-blue-500/20 bg-blue-500/10 text-blue-200"
                          : "border-white/10 bg-white/[0.05] text-white/55")
                      }>
                        {bucket.acl === "public-read" ? "Public read" : "Private"}
                      </span>
                      {bucket.versioning_enabled && (
                        <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                          Versioning
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell sm:px-5">
                    <div className="flex flex-col gap-1 text-sm text-white/72">
                      <span>{bucket.object_count || 0} objects</span>
                      <span className="text-xs text-white/35">{formatSize(bucket.size_bytes)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-5">
                    <StatusBadge status={bucket.status} />
                  </td>
                  <td className="px-4 py-4 sm:px-5">
                    <div className="flex items-center justify-end gap-2">
                      <span className="hidden text-xs text-white/35 xl:inline-block">
                        {format(new Date(bucket.created_at), "MMM d, yyyy")}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 border border-white/[0.1] bg-white/[0.03] px-3 text-white/80 hover:bg-white/[0.08]"
                        asChild
                      >
                        <Link href={"/dashboard/services/object-storage/" + bucket.id}>View</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/[0.08] px-4 py-3 text-xs text-white/40 sm:px-5 md:hidden">
          Open a bucket to view credentials, endpoint details, and settings.
        </div>
      </div>
    </motion.div>
  );
};

export default BucketsTable;
