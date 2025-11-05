"use client";

import { motion } from "motion/react";
import { HardDrive, Plus } from "lucide-react";
import Link from "next/link";
import { ObjectSpaceBucket } from "@/lib/supabase/types";
import { Tables } from "@/lib/supabase/types";
import BucketsList from "./buckets-list";

interface ObjectStorageMainProps {
  buckets: ObjectSpaceBucket[];
  projects: Tables<"projects">[];
  userId: string;
}

const ObjectStorageMain = ({ buckets, projects, userId }: ObjectStorageMainProps) => {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold">Object Storage</h1>
          <p className="text-white/60">
            Manage your Spaces buckets for storing files and objects.
          </p>
        </div>
          <Link
          href="/dashboard/services/object-storage/new"
          className="group relative inline-flex items-center justify-center px-6 py-2.5 font-medium text-black transition-all duration-200 bg-white rounded-md hover:bg-gray-200"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          New Bucket
        </Link>
      </motion.div>

      
      
      <BucketsList buckets={buckets} />
    </>
  );
};

export default ObjectStorageMain;
