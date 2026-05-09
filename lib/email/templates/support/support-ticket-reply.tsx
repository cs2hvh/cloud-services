import { Section, Text } from "@react-email/components";
import {
  BaseEmailLayout,
  EmailCard,
  EmailList,
  EmailParagraph,
} from "@/lib/email/components/base-layout";
import type { SupportTicketReplyEmailData } from "@/lib/email/types";

const MESSAGE_BORDER_COLORS: Record<"user" | "admin" | "system", string> = {
  user: "#0891b2",
  admin: "#2563eb",
  system: "#6b7280",
};

export function SupportTicketReplyEmailTemplate(data: SupportTicketReplyEmailData) {
  return (
    <BaseEmailLayout
      actionLabel="Open Conversation"
      actionUrl={data.ticketUrl}
      greeting={`Hi ${data.customerName},`}
      preview={`New support reply for ticket ${data.ticketNumber}.`}
      title="New Reply on Your Ticket"
    >
      <EmailParagraph>
        A support team member has replied to your ticket. You can continue the conversation from your dashboard.
      </EmailParagraph>

      <EmailCard accent="#2563eb">
        <EmailList
          items={[
            { label: "Ticket Number", value: data.ticketNumber },
            { label: "Subject", value: data.ticketSubject },
            { label: "Status", value: data.ticketStatus },
            { label: "Replied At", value: data.repliedAt },
          ]}
        />
      </EmailCard>

      <Section style={styles.latestReplySection}>
        <Text style={styles.sectionTitle}>Latest Reply</Text>
        <Text style={styles.latestReplyBody}>{data.latestReply}</Text>
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>Conversation</Text>
        {data.conversation.length === 0 ? (
          <Text style={styles.emptyText}>No conversation messages yet.</Text>
        ) : (
          data.conversation.map((message, index) => (
            <Section
              key={`${message.actorType}-${message.createdAt}-${index}`}
              style={{
                ...styles.messageCard,
                borderLeft: `4px solid ${MESSAGE_BORDER_COLORS[message.actorType]}`,
              }}
            >
              <Text style={styles.messageHeader}>
                {message.authorName} ({message.authorEmail})
              </Text>
              <Text style={styles.messageMeta}>
                {message.actorLabel} - {message.createdAt}
              </Text>
              <Text style={styles.messageBody}>{message.body}</Text>
            </Section>
          ))
        )}
      </Section>
    </BaseEmailLayout>
  );
}

const styles = {
  latestReplySection: {
    margin: "16px 0",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: "700",
    color: "#111827",
  },
  latestReplyBody: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "22px",
    color: "#374151",
    whiteSpace: "pre-wrap" as const,
  },
  emptyText: {
    margin: "0 0 8px",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#6b7280",
  },
  messageCard: {
    margin: "0 0 10px",
    padding: "12px 14px",
    borderRadius: "10px",
    backgroundColor: "#f9fafb",
  },
  messageHeader: {
    margin: "0 0 2px",
    fontSize: "13px",
    lineHeight: "18px",
    fontWeight: "600",
    color: "#111827",
  },
  messageMeta: {
    margin: "0 0 8px",
    fontSize: "12px",
    lineHeight: "16px",
    color: "#6b7280",
  },
  messageBody: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "22px",
    color: "#374151",
    whiteSpace: "pre-wrap" as const,
  },
};

