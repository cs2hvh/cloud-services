"use server";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { getUser } from "@/lib/supabase/auth";
import { Clusters, Projects } from "@/lib/supabase/queries";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ObjectStorage from "@/components/dashboard/object-storage/objectstorage";

const ObjectStorageNewSuspense = async () => {
  const user = await getUser();

  if (!user) {
    notFound();
  }

  if (!user) {
    throw new Error("User not found");
  }
  const projects = await Projects.get_all_by_user(user.id);
  const clusters = await Clusters.get_by_user_id(user.id);
  //console.log("Projects in Kube new page", projects);
  return <ObjectStorage/>;
};

const ObjectStorageNewPage = () => {
  return (
   
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <LoadingSpinner />
            </div>
          }
        >
          <ObjectStorageNewSuspense />
        </Suspense>
     
  );
};

export default ObjectStorageNewPage;
