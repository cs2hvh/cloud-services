import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { SupportTicketStatus } from "@/lib/support/catalog";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ ticketId: string }> };

async function getAdminTicketWithSignedUrls(ticketId: string) {
  const ticket = await SupportTickets.getByIdForAdmin(ticketId);
  if (!ticket) {
    return null;
  }

  const supabase = await createServiceClient();
  const attachments = await Promise.all(
    ticket.attachments.map(async (attachment) => {
      const { data } = await supabase.storage
        .from("support-ticket-files")
        .createSignedUrl(attachment.file_path, 60 * 60);
      return {
        ...attachment,
        download_url: data?.signedUrl || null,
      };
    })
  );

  return {
    ...ticket,
    attachments,
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  try {
    const { ticketId } = await params;
    const ticket = await getAdminTicketWithSignedUrls(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("[Admin SupportTicket API] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch support ticket" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.userId) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  try {
    const { ticketId } = await params;
    const existing = await SupportTickets.getByIdForAdmin(ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = (await request.json()) as { status?: string; reply?: string };
    const nextStatus = body.status?.trim().toLowerCase();
    const reply = body.reply?.trim() || "";

    if (!nextStatus && !reply) {
      return NextResponse.json({ error: "No update payload provided" }, { status: 400 });
    }

    if (reply.length > 0 && reply.length < 2) {
      return NextResponse.json({ error: "Reply must be at least 2 characters" }, { status: 400 });
    }

    if (nextStatus && nextStatus !== "open" && nextStatus !== "resolved") {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    if (reply.length > 0) {
      const message = await SupportTickets.addMessage({
        ticketId,
        actorType: "admin",
        authorId: adminCheck.userId,
        message: reply,
      });

      if (!message) {
        return NextResponse.json({ error: "Failed to add reply" }, { status: 500 });
      }
    }

    if (nextStatus && nextStatus !== existing.status) {
      const updated = await SupportTickets.updateStatusByAdmin(ticketId, nextStatus as SupportTicketStatus);
      if (!updated) {
        return NextResponse.json({ error: "Failed to update ticket status" }, { status: 500 });
      }

      await SupportTickets.addMessage({
        ticketId,
        actorType: "system",
        message:
          nextStatus === "resolved"
            ? "Ticket marked as resolved by support."
            : "Ticket reopened by support.",
      });
    }

    const refreshed = await getAdminTicketWithSignedUrls(ticketId);
    if (!refreshed) {
      return NextResponse.json({ error: "Ticket not found after update" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: refreshed,
    });
  } catch (error) {
    console.error("[Admin SupportTicket API] PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update support ticket" }, { status: 500 });
  }
}
