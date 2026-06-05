import { emailService } from "@/lib/email";
import { getEmailConfig } from "@/lib/email/config";
import { SUPPORT_STATUS_LABELS, SupportTicketStatus } from "@/lib/support/catalog";
import { plainTextFromRichText, sanitizeSupportRichText } from "@/lib/support/richtext";
import { SupportTicketMessage } from "@/lib/supabase/queries/support_tickets";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayTextFromRichText(value: string): string {
  const plain = plainTextFromRichText(sanitizeSupportRichText(value));
  return plain.length > 0 ? plain : "-";
}

function getMessageIdentity(message: SupportTicketMessage): {
  name: string;
  email: string;
} {
  if (message.author) {
    return {
      name: message.author.display_name || message.author.username || message.author.email || "User",
      email: message.author.email || "No email",
    };
  }

  if (message.actor_type === "admin") {
    return { name: "Support Team", email: "support@ahurasense.com" };
  }
  if (message.actor_type === "system") {
    return { name: "System", email: "-" };
  }
  return { name: "User", email: "-" };
}

function toConversation(messages: SupportTicketMessage[]) {
  return messages.map((message) => {
    const identity = getMessageIdentity(message);
    return {
      actorType: message.actor_type,
      actorLabel: message.actor_type.toUpperCase(),
      authorName: identity.name,
      authorEmail: identity.email,
      createdAt: formatDateTime(message.created_at),
      body: displayTextFromRichText(message.message),
    };
  });
}

function getTicketUrl(ticketId: string): string {
  const { appUrl } = getEmailConfig();
  return `${appUrl}/dashboard/support/${ticketId}`;
}

interface SendTicketCreatedEmailInput {
  to: string;
  customerName: string;
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  ticketBody: string;
  createdAt: string;
  messages: SupportTicketMessage[];
}

export async function sendSupportTicketCreatedEmail(input: SendTicketCreatedEmailInput) {
  return emailService.sendTemplate({
    template: "supportTicketCreated",
    to: input.to,
    data: {
      customerName: input.customerName,
      ticketNumber: input.ticketNumber,
      ticketSubject: input.ticketSubject,
      ticketBody: displayTextFromRichText(input.ticketBody),
      createdAt: formatDateTime(input.createdAt),
      ticketUrl: getTicketUrl(input.ticketId),
      conversation: toConversation(input.messages),
    },
  });
}

interface SendTicketReplyEmailInput {
  to: string;
  customerName: string;
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  latestReply: string;
  repliedAt: string;
  ticketStatus: SupportTicketStatus;
  messages: SupportTicketMessage[];
}

export async function sendSupportTicketReplyEmail(input: SendTicketReplyEmailInput) {
  return emailService.sendTemplate({
    template: "supportTicketReply",
    to: input.to,
    data: {
      customerName: input.customerName,
      ticketNumber: input.ticketNumber,
      ticketSubject: input.ticketSubject,
      latestReply: displayTextFromRichText(input.latestReply),
      repliedAt: formatDateTime(input.repliedAt),
      ticketStatus: SUPPORT_STATUS_LABELS[input.ticketStatus],
      ticketUrl: getTicketUrl(input.ticketId),
      conversation: toConversation(input.messages),
    },
  });
}

