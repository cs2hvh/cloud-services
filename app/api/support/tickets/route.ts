import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import {
  getFileExtension,
  isAllowedSupportFile,
  isValidSupportTopicSelection,
  SUPPORT_FILE_MAX_SIZE_BYTES,
  SUPPORT_MAX_ATTACHMENTS,
  SupportTicketStatus,
} from "@/lib/support/catalog";

interface CreateTicketPayload {
  topic: string;
  subTopic: string;
  tertiaryTopic: string;
  subject: string;
  affectedResourceType?: string | null;
  affectedResourceId?: string | null;
  affectedResourceName?: string | null;
  description: string;
}

function normalizeCreateTicketPayload(payload: Record<string, unknown>): CreateTicketPayload {
  return {
    topic: String(payload.topic || "").trim(),
    subTopic: String(payload.subTopic || "").trim(),
    tertiaryTopic: String(payload.tertiaryTopic || "").trim(),
    subject: String(payload.subject || "").trim(),
    affectedResourceType:
      payload.affectedResourceType != null && String(payload.affectedResourceType).trim().length > 0
        ? String(payload.affectedResourceType).trim()
        : null,
    affectedResourceId:
      payload.affectedResourceId != null && String(payload.affectedResourceId).trim().length > 0
        ? String(payload.affectedResourceId).trim()
        : null,
    affectedResourceName:
      payload.affectedResourceName != null && String(payload.affectedResourceName).trim().length > 0
        ? String(payload.affectedResourceName).trim()
        : null,
    description: String(payload.description || "").trim(),
  };
}

function validateCreatePayload(payload: CreateTicketPayload): string | null {
  if (!payload.topic || !payload.subTopic || !payload.tertiaryTopic) {
    return "Topic, sub-topic, and tertiary-topic are required";
  }

  if (!isValidSupportTopicSelection(payload.topic, payload.subTopic, payload.tertiaryTopic)) {
    return "Invalid topic selection";
  }

  if (!payload.subject || payload.subject.length < 4) {
    return "Subject must be at least 4 characters";
  }

  if (payload.subject.length > 160) {
    return "Subject cannot exceed 160 characters";
  }

  if (!payload.description || payload.description.length < 10) {
    return "Issue description must be at least 10 characters";
  }

  if (payload.description.length > 8000) {
    return "Issue description cannot exceed 8000 characters";
  }

  return null;
}

function validateAttachment(file: File): string | null {
  if (file.size > SUPPORT_FILE_MAX_SIZE_BYTES) {
    return `${file.name} exceeds the 10MB file size limit`;
  }

  if (!isAllowedSupportFile(file.name, file.type)) {
    const ext = getFileExtension(file.name);
    return `${file.name} is not supported. Allowed types: svg, png, jpg, jpeg, pdf, docx (received .${ext || "unknown"})`;
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    if (status && status !== "open" && status !== "resolved") {
      return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
    }

    if (status) {
      const tickets = await SupportTickets.listByUser(auth.user.id, status as SupportTicketStatus);
      return NextResponse.json({
        success: true,
        data: tickets,
        counts: {
          open: status === "open" ? tickets.length : 0,
          resolved: status === "resolved" ? tickets.length : 0,
        },
      });
    }

    const [openTickets, resolvedTickets] = await Promise.all([
      SupportTickets.listByUser(auth.user.id, "open"),
      SupportTickets.listByUser(auth.user.id, "resolved"),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        open: openTickets,
        resolved: resolvedTickets,
      },
      counts: {
        open: openTickets.length,
        resolved: resolvedTickets.length,
      },
    });
  } catch (error) {
    console.error("[SupportTickets API] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch support tickets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const contentType = request.headers.get("content-type") || "";

    let payload: CreateTicketPayload;
    let attachments: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload = normalizeCreateTicketPayload({
        topic: formData.get("topic"),
        subTopic: formData.get("subTopic"),
        tertiaryTopic: formData.get("tertiaryTopic"),
        subject: formData.get("subject"),
        affectedResourceType: formData.get("affectedResourceType"),
        affectedResourceId: formData.get("affectedResourceId"),
        affectedResourceName: formData.get("affectedResourceName"),
        description: formData.get("description"),
      });
      attachments = formData
        .getAll("attachments")
        .filter((item): item is File => item instanceof File && item.size > 0);
    } else {
      const json = await request.json();
      payload = normalizeCreateTicketPayload(json as Record<string, unknown>);
    }

    const validationError = validateCreatePayload(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

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
      description: payload.description,
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
