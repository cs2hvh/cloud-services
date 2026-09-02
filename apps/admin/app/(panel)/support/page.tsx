import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import AdminSupportTickets from "@admin/components/admin/support/admin-support-tickets";

export const dynamic = "force-dynamic";

const AdminSupportTicketsSuspense = async () => {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const initial = await SupportTickets.listForAdmin({
    page: 1,
    limit: 10,
    status: "all",
  });

  return (
    <AdminSupportTickets
      initialTickets={initial.tickets}
      initialPagination={initial.pagination}
      basePath="/support"
    />
  );
};

export default function AdminSupportTicketsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminSupportTicketsSuspense />
    </Suspense>
  );
}
