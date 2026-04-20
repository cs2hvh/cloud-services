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
    <div className="dashboard-bg flex-1 min-h-screen px-6 py-5 text-white sm:px-8 sm:py-8 xl:px-9">
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <LoadingSpinner />
          </div>
        }
      >
        <SupportTicketsSuspense />
      </Suspense>
    </div>
  );
}
