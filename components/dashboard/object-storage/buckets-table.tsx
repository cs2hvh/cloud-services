"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, Archive, Plus } from "lucide-react";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import Link from "next/link";

interface BucketsTableProps {
  buckets: ObjectSpaceBucket[];
}

const BucketsTable = ({ buckets }: BucketsTableProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
          <table className="w-full border border-white/10 rounded-xl overflow-hidden">
            <thead className="bg-slate-700/50 text-white">
              <tr>
                <Th>Name</Th>
                <Th>Id</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th>Actions</Th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-700/60 bg-white/5">
              {buckets.map((bucket) => (
                <TableRow
                  key={bucket.id}
                  className="group border-t border-white/10 hover:bg-white/10 transition-all duration-150"
                >
                  {/* Name */}
                  <Td>
                    <div className="font-medium text-white">{bucket.name}</div>
                  </Td>

                  {/* Bucket ID with Copy */}
                  <td className="py-4 px-4">
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
                  <td className="py-4 px-4">
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
                  </td>

                  {/* Created Date */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-white/80 text-sm">
                        {format(new Date(bucket.created_at), "MMM d, yyyy")}
                      </span>
                      <span className="text-white/40 text-xs">
                        {format(new Date(bucket.created_at), "HH:mm:ss")}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/services/object-storage/${bucket.id}`}
                        className="inline-flex items-center justify-center
                            rounded-md border border-blue-500
                            px-3 py-1.5 text-sm font-medium
                            text-blue-400
                            hover:bg-blue-500/15 hover:text-blue-300
                            active:scale-[0.97]
                            transition-all duration-200
                            w-full sm:w-auto"
                      >
                        View Bucket
                      </Link>
                    </div>
                  </Td>
                </TableRow>
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
