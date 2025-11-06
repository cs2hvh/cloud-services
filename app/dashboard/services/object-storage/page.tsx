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
  const encryptionKey = process.env.ENCRYPTION_KEY;

  // Decrypt endpoints and credentials for all buckets
  const buckets = rawBuckets.map(bucket => {
    const decryptedBucket = { ...bucket };
    
    // Decrypt endpoint
    if (bucket.endpoint && encryptionKey) {
      try {
        if (bucket.endpoint.startsWith('{')) {
          // Endpoint is encrypted (JSON stringified)
          const encryptedData = JSON.parse(bucket.endpoint);
          decryptedBucket.endpoint = Encryption.decrypt(encryptedData, encryptionKey);
        }
      } catch (error) {
        console.error(`Error decrypting endpoint for bucket ${bucket.id}:`, error);
        // Keep original endpoint if decryption fails
      }
    }

    // Decrypt access key
    if (bucket.key_id && encryptionKey) {
      try {
        if (bucket.key_id.startsWith('{')) {
          const encryptedData = JSON.parse(bucket.key_id);
          decryptedBucket.key_id = Encryption.decrypt(encryptedData, encryptionKey);
        }
      } catch (error) {
        console.error(`Error decrypting key_id for bucket ${bucket.id}:`, error);
      }
    }

    // Decrypt secret key
    if (bucket.secret_key && encryptionKey) {
      try {
        if (bucket.secret_key.startsWith('{')) {
          const encryptedData = JSON.parse(bucket.secret_key);
          decryptedBucket.secret_key = Encryption.decrypt(encryptedData, encryptionKey);
        }
      } catch (error) {
        console.error(`Error decrypting secret_key for bucket ${bucket.id}:`, error);
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
