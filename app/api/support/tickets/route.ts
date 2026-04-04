import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createServiceClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import {
  SUPPORT_CLOSED_STATUSES,
  SUPPORT_OPEN_STATUSES,
  getFileExtension,
  isAllowedSupportFile,
  SUPPORT_FILE_MAX_SIZE_BYTES,
  SUPPORT_MAX_ATTACHMENTS,
} from "@/lib/support/catalog";
import { sanitizeSupportRichText } from "@/lib/support/richtext";
import { createSupportTicketSchema, supportTicketListQuerySchema } from "@/lib/validation/support";
import { sendSupportTicketCreatedEmail } from "@/lib/support/email";

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

function tooManyRequestsResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too Many Requests", message: `Retry after ${retryAfterSec}s` },
    { status: 429 }
  );
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-tickets-list",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  try {
    const url = new URL(request.url);
    const parsedQuery = supportTicketListQuerySchema.safeParse({
      status: url.searchParams.get("status") || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
    }

    const { status } = parsedQuery.data;

    if (status) {
      const tickets = await SupportTickets.listByUser(auth.user.id, status);
      return NextResponse.json({
        success: true,
        data: tickets,
        counts: {
          open: SUPPORT_OPEN_STATUSES.includes(status) ? tickets.length : 0,
          closed: SUPPORT_CLOSED_STATUSES.includes(status) ? tickets.length : 0,
        },
      });
    }

    const [openTickets, closedTickets] = await Promise.all([
      SupportTickets.listByUser(auth.user.id, SUPPORT_OPEN_STATUSES),
      SupportTickets.listByUser(auth.user.id, SUPPORT_CLOSED_STATUSES),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        open: openTickets,
        closed: closedTickets,
      },
      counts: {
        open: openTickets.length,
        closed: closedTickets.length,
      },
    });
  } catch (error) {
    console.error("[SupportTickets API] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch support tickets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-ticket-create",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    let payloadInput: Record<string, unknown>;
    let attachments: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payloadInput = {
        topic: formData.get("topic"),
        subTopic: formData.get("subTopic"),
        tertiaryTopic: formData.get("tertiaryTopic"),
        subject: formData.get("subject"),
        affectedResourceType: normalizeNullableField(formData.get("affectedResourceType")),
        affectedResourceId: normalizeNullableField(formData.get("affectedResourceId")),
        affectedResourceName: normalizeNullableField(formData.get("affectedResourceName")),
        description: formData.get("description"),
      };
      attachments = formData
        .getAll("attachments")
        .filter((item): item is File => item instanceof File && item.size > 0);
    } else {
      const json = await request.json();
      const input = json as Record<string, unknown>;
      payloadInput = {
        ...input,
        affectedResourceType: normalizeNullableField(input.affectedResourceType),
        affectedResourceId: normalizeNullableField(input.affectedResourceId),
        affectedResourceName: normalizeNullableField(input.affectedResourceName),
      };
    }

    const validation = validateRequest(createSupportTicketSchema, payloadInput);
    if (!validation.success) {
      return validation.response;
    }

    const payload = validation.data;

    if (attachments.length > SUPPORT_MAX_ATTACHMENTS) {
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

    const created = await SupportTickets.create({
      ownerId: auth.user.id,
      topic: payload.topic,
      subTopic: payload.subTopic,
      tertiaryTopic: payload.tertiaryTopic,
      subject: payload.subject,
      description: sanitizeSupportRichText(payload.description),
      affectedResourceType: payload.affectedResourceType ?? null,
      affectedResourceId: payload.affectedResourceId ?? null,
      affectedResourceName: payload.affectedResourceName ?? null,
    });

    if (!created) {
      return NextResponse.json({ error: "Failed to create support ticket" }, { status: 500 });
    }

    const uploadWarnings: string[] = [];
    let uploadedCount = 0;

    if (attachments.length > 0) {
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
        const objectPath = `${auth.user.id}/${created.ticket.id}/${Date.now()}_${index}_${safeFileName}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
          .from("support-ticket-files")
          .upload(objectPath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) {
          uploadWarnings.push(`${file.name}: upload failed`);
          continue;
        }

        uploadedCount += 1;
        attachmentRows.push({
          ticketId: created.ticket.id,
          messageId: created.messageId,
          uploadedBy: auth.user.id,
          fileName: file.name,
          filePath: objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        });
      }

      if (attachmentRows.length > 0) {
        const saved = await SupportTickets.addAttachments(attachmentRows);
        if (!saved) {
          uploadWarnings.push("Some uploaded files could not be linked to the ticket metadata");
        }
      }
    }

    if (auth.user.email) {
      const detail = await SupportTickets.getByIdForUser(auth.user.id, created.ticket.id);
      const emailResult = await sendSupportTicketCreatedEmail({
        to: auth.user.email,
        customerName:
          auth.user.user_metadata?.username ||
          auth.user.user_metadata?.display_name ||
          auth.user.email.split("@")[0] ||
          "User",
        ticketId: created.ticket.id,
        ticketNumber: created.ticket.ticket_number,
        ticketSubject: created.ticket.subject,
        ticketBody: payload.description,
        createdAt: created.ticket.created_at,
        messages: detail?.messages || [],
      });

      if (!emailResult.success) {
        console.error("[SupportTickets API] Failed to send ticket-created email:", emailResult.error);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: created.ticket,
        meta: {
          uploaded_attachments: uploadedCount,
          warnings: uploadWarnings,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SupportTickets API] POST failed:", error);
    return NextResponse.json({ error: "Failed to create support ticket" }, { status: 500 });
  }
}
