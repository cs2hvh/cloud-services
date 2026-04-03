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
    <div className="flex-1 bg-[#0a0a0a] min-h-screen p-4 sm:p-6 lg:p-8">
      <SupportTicketDetailView
        ticket={{ ...ticket, attachments: attachmentsWithSignedUrls }}
        initialResources={resources}
      />
    </div>
  );
}
