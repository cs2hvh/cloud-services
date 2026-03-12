"use client";

import { useMemo, type ElementType } from "react";
import { motion } from "motion/react";
import {
  Archive,
  CheckCircle2,
  Globe2,
  Plus,
  Waypoints,
} from "lucide-react";
import Link from "next/link";

import { ObjectSpaceBucket, Tables } from "@/lib/supabase/types";
import BucketsTable from "./buckets-table";

interface ObjectStorageMainProps {
  buckets: ObjectSpaceBucket[];
  projects: Tables<"projects">[];
  userId: string;
}

function MetricCard({
  label,
  value,
  meta,
  icon: Icon,
  accentClassName = "text-white/60",
}: {
  label: string;
  value: string | number;
  meta: string;
  icon: ElementType;
  accentClassName?: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm text-white/45">{meta}</p>
        </div>
        <div className={"flex h-10 w-10 items-center justify-center border border-white/[0.08] bg-white/[0.06] " + accentClassName}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

const ObjectStorageMain = ({ buckets }: ObjectStorageMainProps) => {
  const stats = useMemo(() => {
    const activeBuckets = buckets.filter((bucket) => bucket.status === "active").length;
    const publicBuckets = buckets.filter((bucket) => bucket.acl === "public-read").length;
    const versionedBuckets = buckets.filter((bucket) => bucket.versioning_enabled).length;

    return {
      totalBuckets: buckets.length,
      activeBuckets,
      publicBuckets,
      versionedBuckets,
    };
  }, [buckets]);

  return (
    <div className="flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-3xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/70">
            Storage Service
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Object storage for files, assets, and application data.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[15px]">
            Provision and manage Spaces buckets with cleaner access controls, region visibility,
            and storage operations from a more enterprise dashboard surface.
          </p>
        </div>

        <Link
          href="/dashboard/services/object-storage/new"
          className="inline-flex items-center justify-center gap-2 border border-blue-400/25 bg-blue-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          New Bucket
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.28 }}
        className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Buckets"
          value={stats.totalBuckets}
          meta="Provisioned object storage buckets"
          icon={Archive}
          accentClassName="text-blue-300"
        />
        <MetricCard
          label="Active"
          value={stats.activeBuckets}
          meta="Buckets currently available for traffic"
          icon={CheckCircle2}
          accentClassName="text-emerald-300"
        />
        <MetricCard
          label="Public Access"
          value={stats.publicBuckets}
          meta="Buckets with public read access"
          icon={Globe2}
          accentClassName="text-white/75"
        />
        <MetricCard
          label="Versioning"
          value={stats.versionedBuckets}
          meta="Buckets with object versioning enabled"
          icon={Waypoints}
          accentClassName="text-amber-300"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.28 }}
        className="glass-panel overflow-hidden"
      >
        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Bucket Inventory
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Bucket access, region posture, and operational status.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
                Review bucket visibility, ACL posture, and direct bucket access from one
                operator-focused inventory.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                S3-compatible storage
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                Access keys on demand
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                {stats.totalBuckets} total
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <BucketsTable buckets={buckets} />
        </div>
      </motion.div>
    </div>
  );
};

export default ObjectStorageMain;
