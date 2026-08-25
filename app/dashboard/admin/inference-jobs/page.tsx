import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import InferenceJobsAdmin from "@/components/admin/inference-jobs";

export const dynamic = "force-dynamic";

// Section A4 (Jobs & runners) of nextstespsAI/21-admin-platform.md — the per-job
// half that §8.11 recorded as missing, including retry and cancel. The <main>
// element in app/dashboard/layout.tsx supplies no padding, so every admin page
// owns its own gutter. p-6 sm:p-8 matches components/admin/admin.tsx.
//
// `?service=` lets the AI Overview link straight to the jobs behind a degraded
// capability, which is the whole point of that page's "Manage" column.
const Inner = async ({ service }: { service?: string }) => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  return <InferenceJobsAdmin initialService={service} />;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  return (
    <div className="p-6 sm:p-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <Inner service={service} />
      </Suspense>
    </div>
  );
}
