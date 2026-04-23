"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, HardDrive, Globe2, GitBranch, Key, Settings2 } from "lucide-react";

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
  if (value === 0) return "0 B";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(2) + " KB";
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + " MB";
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

const BucketTabs = ({ bucket, locations }: BucketTabsProps) => {
  const locationData = locations.find((l) => l.short === bucket.region);
  const city = locationData?.city || bucket.region || "Unknown";
  const statusClassName =
    bucket.status === "active"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : bucket.status === "creating"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border-red-500/20 bg-red-500/10 text-red-300";

  const tabs = [
    { value: "info",     label: "Overview",  icon: HardDrive },
    { value: "settings", label: "Settings",  icon: Settings2 },
  ];

  return (
    <div className="space-y-5 px-2 py-4 text-white sm:px-3 lg:px-4">
      {/* Header Panel */}
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
              Object Storage
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {bucket.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">
              Manage access keys, endpoint details, storage usage, and bucket configuration.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:min-w-[520px]">
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Status</div>
              <div className="mt-2">
                <span className={"inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold capitalize " + statusClassName}>
                  {bucket.status || "active"}
                </span>
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Region</div>
              <div className="mt-2 flex items-center gap-1.5">
                {locationData?.country_code && (
                  <Image
                    src={`https://flagsapi.com/${locationData.country_code}/flat/64.png`}
                    alt={city}
                    width={16}
                    height={12}
                    className="rounded-sm"
                    unoptimized
                  />
                )}
                <span className="text-sm font-semibold text-white">{city}</span>
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Access</div>
              <div className="mt-2 text-sm font-semibold text-white capitalize">
                {bucket.acl === "public-read" ? "Public Read" : "Private"}
              </div>
            </div>
            <div className="border border-white/[0.08] bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Objects</div>
              <div className="mt-2 text-sm font-semibold text-white">{(bucket.object_count || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div className="border-t border-white/[0.06] px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
            <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
              <HardDrive className="h-3 w-3" />
              {formatSize(bucket.size_bytes)}
            </span>
            {bucket.versioning_enabled && (
              <span className="flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-violet-300">
                <GitBranch className="h-3 w-3" />
                Versioning on
              </span>
            )}
            {bucket.cors_enabled && (
              <span className="flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-300">
                <Globe2 className="h-3 w-3" />
                CORS enabled
              </span>
            )}
            {bucket.key_id && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-300">
                <Key className="h-3 w-3" />
                Keys provisioned
              </span>
            )}
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
              S3-compatible
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="w-full">
        <div className="glass-panel overflow-hidden">
          <TabsList className="flex h-auto w-full rounded-none border-b border-white/[0.06] bg-transparent p-0">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative flex cursor-pointer items-center gap-2 rounded-none border-r border-white/[0.06] px-5 py-4 text-sm font-medium text-white/50 transition-colors last:border-r-0 data-[state=active]:bg-white/[0.03] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="info" className="mt-5">
          <SingleBucket bucket={bucket} />
        </TabsContent>

        <TabsContent value="settings" className="mt-5">
          <BucketSettings bucket={bucket} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BucketTabs;
