import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { createClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import SupportTicketList from "@/components/dashboard/support/support-ticket-list";
import {
  SUPPORT_CLOSED_STATUSES,
  SUPPORT_OPEN_STATUSES,
} from "@/lib/support/catalog";

export const dynamic = "force-dynamic";

async function SupportTicketsSuspense() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) redirect("/signin");

  const [openTickets, closedTickets] = await Promise.all([
    SupportTickets.listByUser(userId, SUPPORT_OPEN_STATUSES),
    SupportTickets.listByUser(userId, SUPPORT_CLOSED_STATUSES),
  ]);

  return (
    <SupportTicketList
      openTickets={openTickets}
      closedTickets={closedTickets}
    />
  );
}

export default function SupportPage() {
  return (
    <div className="relative min-h-full bg-[#08090b] text-white [&_button]:cursor-pointer [&_a]:cursor-pointer [&_[role=tab]]:cursor-pointer">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
          style={{
            background:
              "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10">
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
    </div>
  );
}
