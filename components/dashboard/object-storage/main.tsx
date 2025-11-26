"use client";

import { motion } from "motion/react";
import {
  // HardDrive,
  Plus,
  // BookOpen,
  // Database,
  Archive,
} from "lucide-react";
import Link from "next/link";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { Tables } from "@/lib/supabase/types";
import BucketsTable from "./buckets-table";
interface ObjectStorageMainProps {
  buckets: ObjectSpaceBucket[];
  projects: Tables<"projects">[];
  userId: string;
}

const ObjectStorageMain = ({
  buckets,
}: ObjectStorageMainProps) => {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6"
      >
        {/* Title Section */}
        <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto">
          {/* Icon */}
          <div className="p-2 bg-neutral-800 rounded-lg flex-shrink-0 mt-1 sm:mt-0">
            <Archive className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-300" />
          </div>

          {/* Text Content */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-white truncate">
              Object Storage
            </h1>
            <p className="text-sm text-neutral-400 mt-0.5 leading-relaxed">
              Manage your Spaces buckets for storing files and objects.
            </p>
          </div>
        </div>

        {/* New Bucket Button */}
        <Link
          href="/dashboard/services/object-storage/new"
          className="group relative inline-flex items-center justify-center px-4 sm:px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200 w-full sm:w-auto text-sm sm:text-base"
        >
          <Plus className="-ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
          <span className="truncate">New Bucket</span>
        </Link>
      </motion.div>

      <BucketsTable buckets={buckets} />
    </>
  );
};

export default ObjectStorageMain;
