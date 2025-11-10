"use client";

import { motion } from "motion/react";
import {
  // HardDrive,
  Plus,
  // BookOpen,
  // Database,
  Archive,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { Tables } from "@/lib/supabase/types";
import BucketsTable from "./buckets-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Documentation from "./api-docs";

interface ObjectStorageMainProps {
  buckets: ObjectSpaceBucket[];
  projects: Tables<"projects">[];
  userId: string;
}

const ObjectStorageMain = ({
  buckets,
  projects,
  userId,
}: ObjectStorageMainProps) => {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-2"
      >
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-neutral-800 rounded-lg">
              <Archive className="h-6 w-6 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Object Storage
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                Manage your Spaces buckets for storing files and objects.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/dashboard/services/object-storage/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          New Bucket
        </Link>
      </motion.div>

     <BucketsTable buckets={buckets} />
    </>
  );
};

export default ObjectStorageMain;
