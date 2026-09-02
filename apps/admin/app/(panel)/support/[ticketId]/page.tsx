import { notFound } from "next/navigation";
import AdminSupportTicketDetailView from "@admin/components/admin/support/admin-support-ticket-detail";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

export default async function AdminSupportTicketDetailPage({
  params,
}: PageProps) {
  const checkAdmin = await requireAdmin();
  if (!checkAdmin.ok) {
    notFound();
  }

  const { ticketId } = await params;
  const ticket = await SupportTickets.getByIdForAdmin(ticketId);
  if (!ticket) {
    notFound();
  }

  const supabase = await createServiceClient();
  const attachmentsWithSignedUrls = await Promise.all(
    ticket.attachments.map(async (attachment) => {
      const { data } = await supabase.storage
        .from("support-ticket-files")
        .createSignedUrl(attachment.file_path, 60 * 60);
      return {
        ...attachment,
        download_url: data?.signedUrl || null,
      };
    }),
  );

  return (
    <AdminSupportTicketDetailView
      initialTicket={{ ...ticket, attachments: attachmentsWithSignedUrls }}
      basePath="/support"
    />
  );
}
