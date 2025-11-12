"use client";

// import { useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SingleBucket from "@/components/dashboard/object-storage/bucket-info";
import BucketSettings from "@/components/dashboard/object-storage/bucket-settings";
import { ObjectSpaceBucket, Tables } from "@/lib/supabase/types";
import { Archive } from "lucide-react";

interface BucketTabsProps {
  bucket: ObjectSpaceBucket;
  locations: Tables<"locations">[];
}

const BucketTabs = ({ bucket,locations }: BucketTabsProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-7xl mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 sm:mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Archive className="h-5 w-5 sm:h-6 sm:w-6 text-white/80" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
                {bucket.name}
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-1 break-words">
                <span className="inline-block">
                  {bucket.object_count || 0} items
                </span>
                <span className="mx-1 hidden sm:inline">/</span>
                <span className="inline-block">
                  {(bucket.size_bytes || 0) === 0
                    ? "0 KB"
                    : (bucket.size_bytes || 0) < 1024
                      ? `${bucket.size_bytes || 0} B`
                      : (bucket.size_bytes || 0) < 1024 * 1024
                        ? `${((bucket.size_bytes || 0) / 1024).toFixed(2)} KB`
                        : (bucket.size_bytes || 0) < 1024 * 1024 * 1024
                          ? `${((bucket.size_bytes || 0) / (1024 * 1024)).toFixed(2)} MB`
                          : `${((bucket.size_bytes || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB`}
                </span>
                <span className="mx-1 hidden sm:inline">/</span>
                <span className="inline-block">{bucket.acl || "private"}</span>
                <span className="mx-1 hidden sm:inline">/</span>
                <span className="inline-block">{locations.find(location => location.short === bucket.region)?.city || "unknown"} </span>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 p-1 w-fit">
          <TabsTrigger
            value="info"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 data-[state=active]:shadow"
          >
            Bucket Info
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 data-[state=active]:shadow"
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
