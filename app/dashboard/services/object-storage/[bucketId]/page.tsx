import BucketTabs from "@/components/dashboard/object-storage/bucket-tabs";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Locations } from "@/lib/supabase/queries/locations";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { notFound } from "next/navigation";
import { Suspense } from "react";

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

  return <BucketTabs bucket={rawBucket} locations={locations} />;
};

export default async function BucketPage({ params }: PageProps) {
  const { bucketId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <SingleBucketSuspense bucketId={bucketId} />
    </Suspense>
  );
}