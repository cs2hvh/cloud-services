import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createServiceClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import {
  SUPPORT_FILE_MAX_SIZE_BYTES,
  SUPPORT_MAX_ATTACHMENTS,
  SUPPORT_OPEN_STATUSES,
  canSupportStatusBeReopened,
  getFileExtension,
  isAllowedSupportFile,
  isSupportOpenStatus,
} from "@/lib/support/catalog";
import { sanitizeSupportRichText } from "@/lib/support/richtext";
import {
  supportAttachmentDeleteSchema,
  supportTicketIdParamSchema,
  updateSupportTicketSchema,
} from "@/lib/validation/support";

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

function validateAttachment(file: File): string | null {
  if (file.size > SUPPORT_FILE_MAX_SIZE_BYTES) {
    return `${file.name} exceeds the 10MB file size limit`;
  }

  if (!isAllowedSupportFile(file.name, file.type)) {
    const ext = getFileExtension(file.name);
    return `${file.name} is not supported. Allowed types: svg, png, jpg, jpeg, pdf, docx, csv, xlsx, txt, doc (received .${ext || "unknown"})`;
  }

  return null;
}

function normalizeNullableField(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getTicketForUser(userId: string, ticketId: string) {
  return SupportTickets.getByIdForUser(userId, ticketId);
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-ticket-read",
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
    const ticket = await getTicketForUser(auth.user.id, ticketId);
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
        can_edit: isSupportOpenStatus(ticket.status),
        can_reopen: canSupportStatusBeReopened(ticket.status),
      },
    });
  } catch (error) {
    console.error("[SupportTicket API] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch support ticket" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-ticket-update",
    limit: 20,
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
    const existing = await getTicketForUser(auth.user.id, ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const normalizedBody = {
      ...body,
      action: typeof body.action === "string" ? body.action.trim() : body.action,
      affectedResourceType: normalizeNullableField(body.affectedResourceType),
      affectedResourceId: normalizeNullableField(body.affectedResourceId),
      affectedResourceName: normalizeNullableField(body.affectedResourceName),
    };

    const validation = validateRequest(updateSupportTicketSchema, normalizedBody);
    if (!validation.success) {
      return validation.response;
    }

    const payload = validation.data;

    if (payload.action === "reopen") {
      if (existing.status === "permantly_close") {
        return NextResponse.json(
          { error: "Permanently closed tickets cannot be reopened" },
          { status: 409 }
        );
      }

      if (!canSupportStatusBeReopened(existing.status)) {
        return NextResponse.json({ error: "Only closed tickets can be reopened" }, { status: 409 });
      }

      const reopened = await SupportTickets.updateStatusByUser(auth.user.id, ticketId, "open");
      if (!reopened) {
        return NextResponse.json({ error: "Failed to reopen ticket" }, { status: 500 });
      }

      await SupportTickets.addMessage({
        ticketId,
        actorType: "system",
        authorId: auth.user.id,
        message: "Ticket reopened by user.",
      });

      const refreshed = await getTicketForUser(auth.user.id, ticketId);
      return NextResponse.json({
        success: true,
        data: refreshed,
      });
    }

    if (!SUPPORT_OPEN_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: "Closed tickets cannot be edited. Reopen first." },
        { status: 409 }
      );
    }

    const sanitizedDescription =
      payload.description !== undefined ? sanitizeSupportRichText(payload.description) : undefined;

    const updated = await SupportTickets.updateByUser(auth.user.id, ticketId, {
      topic: payload.topic,
      subTopic: payload.subTopic,
      tertiaryTopic: payload.tertiaryTopic,
      subject: payload.subject,
      description: sanitizedDescription,
      affectedResourceType: payload.affectedResourceType,
      affectedResourceId: payload.affectedResourceId,
      affectedResourceName: payload.affectedResourceName,
    });
    if (!updated) {
      return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
    }

    if (sanitizedDescription && sanitizedDescription !== existing.description) {
      await SupportTickets.addMessage({
        ticketId,
        actorType: "user",
        authorId: auth.user.id,
        message: `<p><strong>Updated issue details</strong></p>${sanitizedDescription}`,
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-ticket-attachment-add",
    limit: 10,
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
    const existing = await getTicketForUser(auth.user.id, ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!isSupportOpenStatus(existing.status)) {
      return NextResponse.json({ error: "Attachments can be added only on open tickets" }, { status: 409 });
    }

    const formData = await request.formData();
    const attachments = formData
      .getAll("attachments")
      .filter((item): item is File => item instanceof File && item.size > 0);

    if (attachments.length === 0) {
      return NextResponse.json({ error: "No attachment files provided" }, { status: 400 });
    }

    if (existing.attachments.length + attachments.length > SUPPORT_MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Maximum ${SUPPORT_MAX_ATTACHMENTS} attachments are allowed` },
        { status: 400 }
      );
    }

    for (const file of attachments) {
      const fileError = validateAttachment(file);
      if (fileError) {
        return NextResponse.json({ error: fileError }, { status: 400 });
      }
    }

    const supabase = await createServiceClient();
    const attachmentRows: Array<{
      ticketId: string;
      messageId: string | null;
      uploadedBy: string;
      fileName: string;
      filePath: string;
      mimeType: string;
      fileSize: number;
    }> = [];

    for (let index = 0; index < attachments.length; index += 1) {
      const file = attachments[index];
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectPath = `${auth.user.id}/${ticketId}/${Date.now()}_${index}_${safeFileName}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("support-ticket-files")
        .upload(objectPath, fileBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: `${file.name}: upload failed` }, { status: 500 });
      }

      attachmentRows.push({
        ticketId,
        messageId: null,
        uploadedBy: auth.user.id,
        fileName: file.name,
        filePath: objectPath,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      });
    }

    const saved = await SupportTickets.addAttachments(attachmentRows);
    if (!saved) {
      return NextResponse.json({ error: "Failed to save attachment metadata" }, { status: 500 });
    }

    await SupportTickets.addMessage({
      ticketId,
      actorType: "user",
      authorId: auth.user.id,
      message: `<p>Added ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.</p>`,
    });

    const refreshed = await getTicketForUser(auth.user.id, ticketId);
    return NextResponse.json({
      success: true,
      data: refreshed,
    });
  } catch (error) {
    console.error("[SupportTicket API] POST failed:", error);
    return NextResponse.json({ error: "Failed to add attachments" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-ticket-attachment-delete",
    limit: 20,
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
    const existing = await getTicketForUser(auth.user.id, ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!isSupportOpenStatus(existing.status)) {
      return NextResponse.json({ error: "Attachments can be deleted only on open tickets" }, { status: 409 });
    }

    const url = new URL(request.url);
    const attachmentIdParam = url.searchParams.get("attachmentId");
    const body = (await request.json().catch(() => ({}))) as { attachmentId?: unknown };

    const validation = validateRequest(supportAttachmentDeleteSchema, {
      attachmentId: attachmentIdParam || body.attachmentId,
    });
    if (!validation.success) {
      return validation.response;
    }

    const { attachmentId } = validation.data;

    const deleted = await SupportTickets.deleteAttachmentByUser(auth.user.id, ticketId, attachmentId);
    if (!deleted) {
      return NextResponse.json({ error: "Attachment not found or cannot be deleted" }, { status: 404 });
    }

    const supabase = await createServiceClient();
    await supabase.storage.from("support-ticket-files").remove([deleted.file_path]);

    await SupportTickets.addMessage({
      ticketId,
      actorType: "user",
      authorId: auth.user.id,
      message: "<p>Removed an attachment.</p>",
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("[SupportTicket API] DELETE failed:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
