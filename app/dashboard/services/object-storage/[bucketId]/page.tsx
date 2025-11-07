import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import SingleBucket from "@/components/dashboard/object-storage/single-bucket";
import { Encryption } from "@/config/functions";

interface PageProps {
  params: Promise<{ bucketId: string }>;
}

const SingleBucketSuspense = async ({ bucketId }: { bucketId: string }) => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const rawBucket = await ObjectSpaces.get_bucket_by_id(bucketId);

  if (!rawBucket || rawBucket.owner_id !== user.id) {
    notFound();
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  const decryptedBucket = { ...rawBucket };

  // Decrypt endpoint
  if (rawBucket.endpoint && encryptionKey) {
    try {
      if (rawBucket.endpoint.startsWith('{')) {
        // Endpoint is encrypted (JSON stringified)
        const encryptedData = JSON.parse(rawBucket.endpoint);
        decryptedBucket.endpoint = Encryption.decrypt(encryptedData, encryptionKey);
      }
    } catch (error) {
      console.error(`Error decrypting endpoint for bucket ${rawBucket.id}:`, error);
      // Keep original endpoint if decryption fails
    }
  }

  // Decrypt access key
  if (rawBucket.key_id && encryptionKey) {
    try {
      if (rawBucket.key_id.startsWith('{')) {
        const encryptedData = JSON.parse(rawBucket.key_id);
        decryptedBucket.key_id = Encryption.decrypt(encryptedData, encryptionKey);
      }
    } catch (error) {
      console.error(`Error decrypting key_id for bucket ${rawBucket.id}:`, error);
    }
  }

  // Decrypt secret key
  if (rawBucket.secret_key && encryptionKey) {
    try {
      if (rawBucket.secret_key.startsWith('{')) {
        const encryptedData = JSON.parse(rawBucket.secret_key);
        decryptedBucket.secret_key = Encryption.decrypt(encryptedData, encryptionKey);
      }
    } catch (error) {
      console.error(`Error decrypting secret_key for bucket ${rawBucket.id}:`, error);
    }
  }

  return <SingleBucket bucket={decryptedBucket} />;
};

export default async function BucketPage({ params }: PageProps) {
  const { bucketId } = await params;

  return (
    <div className="flex-1 bg-black min-h-screen p-6 sm:p-8 text-white">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <SingleBucketSuspense bucketId={bucketId} />
      </Suspense>
    </div>
  );
}
