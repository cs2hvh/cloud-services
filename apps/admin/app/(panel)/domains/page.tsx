import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import AdminDomains from "@admin/components/admin/domains/admin-domains";

export const dynamic = "force-dynamic";

const AdminDomainsSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }
  return <AdminDomains />;
};

export default function AdminDomainsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminDomainsSuspense />
    </Suspense>
  );
}
