import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { createServiceClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import {
  adminSupportTicketPatchSchema,
  supportTicketIdParamSchema,
} from "@/lib/validation/support";
import { sendSupportTicketReplyEmail } from "@/lib/support/email";
import { sanitizeSupportRichText } from "@/lib/support/richtext";

type RouteParams = { params: Promise<{ ticketId: string }> };

function tooManyRequestsResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too Many Requests", message: `Retry after ${retryAfterSec}s` },
    { status: 429 }
  );
}

async function parseTicketId(params: Promise<{ ticketId: string }>) {
  const parsed = supportTicketIdParamSchema.safeParse(await params);
  if (!parsed.success) {
    return {
      ticketId: null,
      response: NextResponse.json({ error: "Invalid ticket id" }, { status: 400 }),
    };
  }

  return { ticketId: parsed.data.ticketId, response: null };
}

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

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.userId) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  const rl = await limitByUser(adminCheck.userId, {
    prefix: "rl:admin-support-ticket-read",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  const parsedTicket = await parseTicketId(params);
  if (parsedTicket.response || !parsedTicket.ticketId) {
    return parsedTicket.response as NextResponse;
  }

  const { ticketId } = parsedTicket;

  try {
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.userId) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  const rl = await limitByUser(adminCheck.userId, {
    prefix: "rl:admin-support-ticket-update",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  const parsedTicket = await parseTicketId(params);
  if (parsedTicket.response || !parsedTicket.ticketId) {
    return parsedTicket.response as NextResponse;
  }

  const { ticketId } = parsedTicket;

  try {
    const existing = await SupportTickets.getByIdForAdmin(ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const normalizedBody = {
      status: typeof body.status === "string" ? body.status.trim().toLowerCase() : body.status,
      reply:
        typeof body.reply === "string"
          ? body.reply.trim() || undefined
          : body.reply,
    };

    const validation = validateRequest(adminSupportTicketPatchSchema, normalizedBody);
    if (!validation.success) {
      return validation.response;
    }

    const nextStatus = validation.data.status;
    const reply = sanitizeSupportRichText(validation.data.reply || "");
    let replyCreatedAt: string | null = null;

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

      replyCreatedAt = message.created_at;
    }

    if (nextStatus && nextStatus !== existing.status) {
      const updated = await SupportTickets.updateStatusByAdmin(ticketId, nextStatus);
      if (!updated) {
        return NextResponse.json({ error: "Failed to update ticket status" }, { status: 500 });
      }

      await SupportTickets.addMessage({
        ticketId,
        actorType: "system",
        message: `Ticket status updated by support to ${nextStatus.toUpperCase()}.`,
      });
    }

    const refreshed = await getAdminTicketWithSignedUrls(ticketId);
    if (!refreshed) {
      return NextResponse.json({ error: "Ticket not found after update" }, { status: 404 });
    }

    if (reply.length > 0 && refreshed.owner?.email) {
      const emailResult = await sendSupportTicketReplyEmail({
        to: refreshed.owner.email,
        customerName:
          refreshed.owner.display_name ||
          refreshed.owner.username ||
          refreshed.owner.email ||
          "User",
        ticketId: refreshed.id,
        ticketNumber: refreshed.ticket_number,
        ticketSubject: refreshed.subject,
        latestReply: reply,
        repliedAt: replyCreatedAt || new Date().toISOString(),
        ticketStatus: refreshed.status,
        messages: refreshed.messages,
      });

      if (!emailResult.success) {
        console.error("[Admin SupportTicket API] Failed to send support-reply email:", emailResult.error);
      }
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
