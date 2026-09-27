import { beforeEach, describe, expect, it, vi } from "vitest";

// Ticket emails go to the customer and list every message as "name (email)".
// A staff reply that arrives WITH its full author profile, the exact shape
// that leaked, must still render as "AhuraSense Support" with the support
// address. The reorder that fixes this looks trivially correct, which is how
// the unreachable fallback shipped in the first place, so this checks the
// payload the email service actually receives.

const sendTemplate = vi.fn(async (_input: unknown) => ({ success: true }));

vi.mock("@/lib/email", () => ({ emailService: { sendTemplate } }));
vi.mock("@/lib/email/config", () => ({ getEmailConfig: () => ({ appUrl: "https://ahurasense.com" }) }));

const staffAuthor = {
  id: "staff-1",
  username: "jane.staff",
  display_name: "Jane Staff",
  email: "jane.staff@ahurasense.com",
  avatar: null,
};
const customerAuthor = {
  id: "owner-1",
  username: "cust",
  display_name: "Customer Person",
  email: "customer@example.com",
  avatar: null,
};

const messages = [
  { id: "m-1", ticket_id: "t-1", author_id: "owner-1", actor_type: "user" as const, message: "hi", created_at: "2026-09-27T00:01:00Z", author: customerAuthor },
  { id: "m-2", ticket_id: "t-1", author_id: "staff-1", actor_type: "admin" as const, message: "hello", created_at: "2026-09-27T00:02:00Z", author: staffAuthor },
];

describe("ticket emails hide staff identity", () => {
  beforeEach(() => sendTemplate.mockClear());

  it("the reply email renders a staff reply as AhuraSense Support", async () => {
    const { sendSupportTicketReplyEmail } = await import("@/lib/support/email");
    await sendSupportTicketReplyEmail({
      to: "customer@example.com",
      customerName: "Customer Person",
      ticketId: "t-1",
      ticketNumber: "AS-1",
      ticketSubject: "Help",
      latestReply: "hello",
      repliedAt: "2026-09-27T00:02:00Z",
      ticketStatus: "open",
      messages,
    } as never);

    const payload = JSON.stringify(sendTemplate.mock.calls[0]?.[0]);
    expect(payload).not.toContain("jane.staff@ahurasense.com");
    expect(payload).not.toContain("Jane Staff");
    expect(payload).not.toContain("jane.staff");
    expect(payload).toContain("AhuraSense Support");
    expect(payload).toContain("Customer Person");
  });

  it("the created email does the same", async () => {
    const { sendSupportTicketCreatedEmail } = await import("@/lib/support/email");
    await sendSupportTicketCreatedEmail({
      to: "customer@example.com",
      customerName: "Customer Person",
      ticketId: "t-1",
      ticketNumber: "AS-1",
      ticketSubject: "Help",
      ticketBody: "hi",
      createdAt: "2026-09-27T00:01:00Z",
      messages,
    } as never);

    const payload = JSON.stringify(sendTemplate.mock.calls[0]?.[0]);
    expect(payload).not.toContain("jane.staff@ahurasense.com");
    expect(payload).not.toContain("Jane Staff");
    expect(payload).toContain("AhuraSense Support");
  });
});
