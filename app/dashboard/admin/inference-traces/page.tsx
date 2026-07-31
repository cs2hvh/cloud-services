import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import InferenceTracesAdmin from "@/components/admin/inference-traces";

export const dynamic = "force-dynamic";

// Observability over inference.trace_spans — §4 A6 of
// nextstespsAI/21-admin-platform.md. The <main> in app/dashboard/layout.tsx
// supplies no padding, so every admin page owns its gutter (p-6 sm:p-8).
const Inner = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  return <InferenceTracesAdmin />;
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
