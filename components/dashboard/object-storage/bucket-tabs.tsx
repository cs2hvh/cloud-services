"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SingleBucket from "@/components/dashboard/object-storage/bucket-info";
import BucketSettings from "@/components/dashboard/object-storage/bucket-settings";
import { ObjectSpaceBucket, Tables } from "@/lib/supabase/types";

interface BucketTabsProps {
  bucket: ObjectSpaceBucket;
  locations: Tables<"locations">[];
}

function formatSize(bytes: number | null | undefined) {
  const value = bytes || 0;
  if (value === 0) return "0 KB";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(2) + " KB";
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + " MB";
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

const BucketTabs = ({ bucket, locations }: BucketTabsProps) => {
  const city = locations.find((location) => location.short === bucket.region)?.city || "Unknown";
  const statusClassName =
    bucket.status === "active"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : bucket.status === "creating"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border-white/10 bg-white/[0.05] text-white/60";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-7xl px-2 sm:px-3 lg:px-4"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Link
                href="/dashboard/services/object-storage"
                className="inline-flex items-center text-sm text-white/60 transition-colors hover:text-white"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to buckets
              </Link>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
                Storage Service
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Bucket access, usage, and configuration controls.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
                Review bucket posture, endpoint details, and bucket settings from a cleaner storage management surface.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:min-w-[420px]">
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Bucket
                </div>
                <div className="mt-2 truncate text-sm font-semibold text-white">
                  {bucket.name}
                </div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Region
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{city}</div>
              </div>
              <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Status
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize " + statusClassName}>
                    {bucket.status || "active"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                {bucket.object_count || 0} objects
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                {formatSize(bucket.size_bytes)}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 capitalize">
                {bucket.acl || "private"}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-2 border border-white/[0.08] bg-white/[0.04] p-1 sm:w-fit">
          <TabsTrigger
            value="info"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-blue-500/90 data-[state=active]:text-white text-white/60"
          >
            Bucket Info
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-blue-500/90 data-[state=active]:text-white text-white/60"
          >
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 sm:mt-6">
          <SingleBucket bucket={bucket} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4 sm:mt-6">
          <BucketSettings bucket={bucket} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default BucketTabs;
