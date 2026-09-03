import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { isSupportOpenStatus } from "@/lib/support/catalog";
import { sanitizeSupportRichText } from "@/lib/support/richtext";
import {
  supportTicketIdParamSchema,
  supportTicketReplySchema,
} from "@/lib/validation/support";

type RouteParams = { params: Promise<{ ticketId: string }> };

function tooManyRequestsResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too Many Requests", message: `Retry after ${retryAfterSec}s` },
    { status: 429 }
  );
}

// Convert plain-text composer input into the simple HTML the thread renders.
// Double newlines → paragraphs, single newlines → <br>. Escaped first, then
// run through the shared sanitizer so the stored markup matches every other message.
function plainTextToHtml(text: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escape(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-ticket-reply",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  const parsedParams = supportTicketIdParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }
  const { ticketId } = parsedParams.data;

  try {
    const existing = await SupportTickets.getByIdForUser(auth.user.id, ticketId);
    if (!existing) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!isSupportOpenStatus(existing.status)) {
      return NextResponse.json(
        { error: "This ticket is closed. Reopen it before replying." },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const validation = validateRequest(supportTicketReplySchema, body);
    if (!validation.success) {
      return validation.response;
    }

    // The composer sends editor HTML, like the create form's description does.
    // Anything WITHOUT markup — a direct API call, an older client — is still
    // treated as plain text so its paragraphs and line breaks survive; running
    // real HTML through plainTextToHtml would escape it and the customer would
    // see their own tags rendered as literal text.
    //
    // Either path ends at the same sanitizer, so what gets stored is the same
    // restricted markup the thread has always rendered.
    const submitted = validation.data.message;
    const containsMarkup = /<\/?[a-z][^>]*>/i.test(submitted);
    const html = sanitizeSupportRichText(
      containsMarkup ? submitted : plainTextToHtml(submitted)
    );
    if (!html || html.replace(/<[^>]*>/g, "").trim().length < 2) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    const message = await SupportTickets.addMessage({
      ticketId,
      actorType: "user",
      authorId: auth.user.id,
      message: html,
    });

    if (!message) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    console.error("[SupportTicket Messages API] POST failed:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
