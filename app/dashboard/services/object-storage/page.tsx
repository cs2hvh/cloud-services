"use server";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { ObjectSpaces, Projects } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ObjectStorageMain from "@/components/dashboard/object-storage/main";
import { Encryption } from "@/config/functions";

const ObjectStorageSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const projects = await Projects.get_all_by_user(user.id);
  const rawBuckets = await ObjectSpaces.get_buckets(user.id);

  // Decrypt endpoints for all buckets
  const buckets = rawBuckets.map(bucket => {
    const decryptedBucket = { ...bucket };
    if (bucket.endpoint) {
      try {
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (encryptionKey && bucket.endpoint.startsWith('{')) {
          // Endpoint is encrypted (JSON stringified)
          const encryptedData = JSON.parse(bucket.endpoint);
          decryptedBucket.endpoint = Encryption.decrypt(encryptedData, encryptionKey);
        }
      } catch (error) {
        console.error(`Error decrypting endpoint for bucket ${bucket.id}:`, error);
        // Keep original endpoint if decryption fails
      }
    }
    return decryptedBucket;
  });

  return <ObjectStorageMain buckets={buckets} projects={projects} userId={user.id} />;
};

const ObjectStoragePage = () => {
  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <ObjectStorageSuspense />
      </Suspense>
    </div>
  );
};

export default ObjectStoragePage;
