import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { createClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import SupportTicketList from "@/components/dashboard/support/support-ticket-list";
import { SUPPORT_CLOSED_STATUSES, SUPPORT_OPEN_STATUSES } from "@/lib/support/catalog";

export const dynamic = "force-dynamic";

async function SupportTicketsSuspense() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;

  if (!userId) {
    redirect("/signin");
  }

  const [openTickets, closedTickets] = await Promise.all([
    SupportTickets.listByUser(userId, SUPPORT_OPEN_STATUSES),
    SupportTickets.listByUser(userId, SUPPORT_CLOSED_STATUSES),
  ]);

  return <SupportTicketList openTickets={openTickets} closedTickets={closedTickets} />;
}

export default function SupportPage() {
  return (
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        }
      >
        <SupportTicketsSuspense />
      </Suspense>
    </div>
  );
}
