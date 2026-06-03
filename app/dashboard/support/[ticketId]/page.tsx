import { notFound, redirect } from "next/navigation";
import SupportTicketDetailView from "@/components/dashboard/support/support-ticket-detail";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

export default async function SupportTicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;

  if (!userId) {
    redirect("/signin");
  }

  const ticket = await SupportTickets.getByIdForUser(userId, ticketId);
  if (!ticket) {
    notFound();
  }

  const [resources, attachmentsWithSignedUrls] = await Promise.all([
    SupportTickets.listAffectedResources(userId, ticket.topic),
    (async () => {
      const serviceSupabase = await createServiceClient();
      return Promise.all(
        ticket.attachments.map(async (attachment) => {
          const { data: signed } = await serviceSupabase.storage
            .from("support-ticket-files")
            .createSignedUrl(attachment.file_path, 60 * 60);
          return {
            ...attachment,
            download_url: signed?.signedUrl || null,
          };
        })
      );
    })(),
  ]);

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
      <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10">
        <SupportTicketDetailView
          ticket={{ ...ticket, attachments: attachmentsWithSignedUrls }}
          initialResources={resources}
        />
      </div>
    </div>
  );
}
