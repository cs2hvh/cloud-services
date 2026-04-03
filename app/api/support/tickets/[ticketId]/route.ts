import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { isValidSupportTopicSelection } from "@/lib/support/catalog";

type RouteParams = { params: Promise<{ ticketId: string }> };

interface UpdateTicketPayload {
  topic?: string;
  subTopic?: string;
  tertiaryTopic?: string;
  subject?: string;
  description?: string;
  affectedResourceType?: string | null;
  affectedResourceId?: string | null;
  affectedResourceName?: string | null;
}

function normalizeUpdatePayload(payload: Record<string, unknown>): UpdateTicketPayload {
  const normalized: UpdateTicketPayload = {};

  if (payload.topic !== undefined) normalized.topic = String(payload.topic || "").trim();
  if (payload.subTopic !== undefined) normalized.subTopic = String(payload.subTopic || "").trim();
  if (payload.tertiaryTopic !== undefined) normalized.tertiaryTopic = String(payload.tertiaryTopic || "").trim();
  if (payload.subject !== undefined) normalized.subject = String(payload.subject || "").trim();
  if (payload.description !== undefined) normalized.description = String(payload.description || "").trim();

  if (payload.affectedResourceType !== undefined) {
    const value = String(payload.affectedResourceType || "").trim();
    normalized.affectedResourceType = value.length > 0 ? value : null;
  }
  if (payload.affectedResourceId !== undefined) {
    const value = String(payload.affectedResourceId || "").trim();
    normalized.affectedResourceId = value.length > 0 ? value : null;
  }
  if (payload.affectedResourceName !== undefined) {
    const value = String(payload.affectedResourceName || "").trim();
    normalized.affectedResourceName = value.length > 0 ? value : null;
  }

  return normalized;
}

function validateUpdatePayload(payload: UpdateTicketPayload): string | null {
  const topicFieldsProvided =
    payload.topic !== undefined || payload.subTopic !== undefined || payload.tertiaryTopic !== undefined;

  if (topicFieldsProvided) {
    if (!payload.topic || !payload.subTopic || !payload.tertiaryTopic) {
      return "Topic, sub-topic, and tertiary-topic must be updated together";
    }
    if (!isValidSupportTopicSelection(payload.topic, payload.subTopic, payload.tertiaryTopic)) {
      return "Invalid topic selection";
    }
  }

  if (payload.subject !== undefined) {
    if (payload.subject.length < 4) return "Subject must be at least 4 characters";
    if (payload.subject.length > 160) return "Subject cannot exceed 160 characters";
  }

  if (payload.description !== undefined) {
    if (payload.description.length < 10) return "Issue description must be at least 10 characters";
    if (payload.description.length > 8000) return "Issue description cannot exceed 8000 characters";
  }

  return null;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { ticketId } = await params;

  try {
    const ticket = await SupportTickets.getByIdForUser(auth.user.id, ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const supabase = await createServiceClient();
    const attachmentsWithUrls = await Promise.all(
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

    return NextResponse.json({
      success: true,
      data: {
        ...ticket,
        attachments: attachmentsWithUrls,
        can_edit: ticket.status === "open",
      },
    });
  } catch (error) {
    console.error("[SupportTicket API] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch support ticket" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { ticketId } = await params;

  try {
    const existing = await SupportTickets.getByIdForUser(auth.user.id, ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (existing.status !== "open") {
      return NextResponse.json(
        { error: "Resolved tickets cannot be edited" },
        { status: 409 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const payload = normalizeUpdatePayload(body);
    const validationError = validateUpdatePayload(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const updated = await SupportTickets.updateByUser(auth.user.id, ticketId, payload);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
    }

    if (payload.description && payload.description !== existing.description) {
      const supabase = await createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supportDb = (supabase as any).schema("support");
      await supportDb.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        author_id: auth.user.id,
        actor_type: "user",
        message: `Updated issue details:\n\n${payload.description}`,
      });
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("[SupportTicket API] PATCH failed:", error);
    return NextResponse.json({ error: "Failed to update support ticket" }, { status: 500 });
  }
}
