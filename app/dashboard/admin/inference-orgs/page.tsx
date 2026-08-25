import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import InferenceOrgsAdmin from "@/components/admin/inference-orgs";

export const dynamic = "force-dynamic";

// Section A2 of nextstespsAI/21-admin-platform.md — orgs & customers.
// The <main> element in app/dashboard/layout.tsx supplies no padding, so every
// admin page owns its own gutter. p-6 sm:p-8 matches components/admin/admin.tsx.
const Inner = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  return <InferenceOrgsAdmin />;
};

export default function Page() {
  return (
    <div className="p-6 sm:p-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <Inner />
      </Suspense>
    </div>
  );
}
