import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Locations, ObjectSpaces } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import BucketTabs from "@/components/dashboard/object-storage/bucket-tabs";
// We avoid decrypting sensitive credentials in SSR; only basic bucket data is shown.

interface PageProps {
  params: Promise<{ bucketId: string }>;
}

const SingleBucketSuspense = async ({ bucketId }: { bucketId: string }) => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  const rawBucket = await ObjectSpaces.get_bucket_by_id(bucketId);
  const locations = await Locations.get_by_type("object");

  if (!rawBucket || rawBucket.owner_id !== user.id) {
    notFound();
  }

  // Pass encrypted bucket; client will fetch decrypted credentials via secure endpoint.
  return <BucketTabs bucket={rawBucket} locations={locations} />;
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
