import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import InferenceRagAdmin from "@/components/admin/inference-rag";

export const dynamic = "force-dynamic";

// RAG / vector storage — §3 of nextstespsAI/21-admin-platform.md lists vector
// collections as having no operator surface. The <main> in app/dashboard/layout.tsx
// supplies no padding, so every admin page owns its own gutter (p-6 sm:p-8).
const Inner = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  return <InferenceRagAdmin />;
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
