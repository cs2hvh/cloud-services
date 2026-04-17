import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_ADMIN_TICKETS } from "@/app/api/admin/support/tickets/route";
import {
  GET as GET_ADMIN_TICKET,
  PATCH as PATCH_ADMIN_TICKET,
} from "@/app/api/admin/support/tickets/[ticketId]/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/supabase/auth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/cooldown/userbased", () => ({
  limitByUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/support/email", () => ({
  sendSupportTicketReplyEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/support_tickets", () => ({
  SupportTickets: {
    listForAdmin: vi.fn(),
    getByIdForAdmin: vi.fn(),
    addMessage: vi.fn(),
    updateStatusByAdmin: vi.fn(),
  },
}));

describe("Admin Support Ticket APIs", () => {
  const adminContext = { ok: true, userId: "admin-1" };

  const adminTicket = {
    id: "ticket-1",
    ticket_number: "TCK-1001",
    status: "open",
    topic: "kubernetes",
    sub_topic: "cluster_health",
    tertiary_topic: "node_not_ready",
    subject: "Node readiness issue",
    description: "<p>Nodes are not getting ready.</p>",
    affected_resource_type: "kubernetes",
    affected_resource_id: "cluster-1",
    affected_resource_name: "Production cluster",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    latest_message_at: "2026-01-01T00:00:00.000Z",
    resolved_at: null,
    owner_id: "user-1",
    owner: {
      id: "user-1",
      username: "testuser",
      display_name: "Test User",
      email: "user1@test.com",
      avatar: null,
    },
    messages: [],
    attachments: [
      {
        id: "att-1",
        ticket_id: "ticket-1",
        message_id: null,
        uploaded_by: "user-1",
        file_name: "trace.txt",
        file_path: "user-1/ticket-1/trace.txt",
        mime_type: "text/plain",
        file_size: 120,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { requireAdmin } = await import("@/lib/supabase/auth");
    vi.mocked(requireAdmin).mockResolvedValue(adminContext as any);

    const { limitByUser } = await import("@/lib/cooldown/userbased");
    vi.mocked(limitByUser).mockResolvedValue({
      allowed: true,
      retryAfterSec: 0,
    } as any);

    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://example.com/signed-admin" },
          }),
        }),
      },
    } as any);

    const { sendSupportTicketReplyEmail } = await import("@/lib/support/email");
    vi.mocked(sendSupportTicketReplyEmail).mockResolvedValue({ success: true } as any);
  });

  describe("GET /api/admin/support/tickets", () => {
    it("should reject non-admin requests", async () => {
      const { requireAdmin } = await import("@/lib/supabase/auth");
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false, userId: null } as any);

      const response = await GET_ADMIN_TICKETS(
        new Request("http://localhost:3000/api/admin/support/tickets") as NextRequest
      );
      const data = await expectResponseStatus(response, 403);

      expect(data.error).toContain("Unauthorized");
    });

    it("should return 400 for invalid query parameters", async () => {
      const response = await GET_ADMIN_TICKETS(
        new Request("http://localhost:3000/api/admin/support/tickets?page=0&limit=101") as NextRequest
      );
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe("Invalid query parameters");
    });

    it("should enforce admin list rate limit", async () => {
      const { limitByUser } = await import("@/lib/cooldown/userbased");
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 18,
      } as any);

      const response = await GET_ADMIN_TICKETS(
        new Request("http://localhost:3000/api/admin/support/tickets") as NextRequest
      );
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe("Too Many Requests");
      expect(data.message).toContain("18");
    });

    it("should return paginated ticket list with filters", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.listForAdmin).mockResolvedValue({
        tickets: [adminTicket],
        pagination: {
          page: 2,
          limit: 5,
          total: 11,
          totalPages: 3,
        },
      } as any);

      const response = await GET_ADMIN_TICKETS(
        new Request(
          "http://localhost:3000/api/admin/support/tickets?page=2&limit=5&status=open&topic=kubernetes&search=tck"
        ) as NextRequest
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.pagination.page).toBe(2);
      expect(SupportTickets.listForAdmin).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        status: "open",
        topic: "kubernetes",
        search: "tck",
      });
    });
  });

  describe("GET /api/admin/support/tickets/[ticketId]", () => {
    it("should validate ticketId path param", async () => {
      const response = await GET_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets") as NextRequest,
        { params: Promise.resolve({ ticketId: "" }) }
      );
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe("Invalid ticket id");
    });

    it("should return 404 for missing ticket", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForAdmin).mockResolvedValue(null as any);

      const response = await GET_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets/ticket-1") as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toBe("Ticket not found");
    });

    it("should return ticket detail with signed attachment URLs", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForAdmin).mockResolvedValue(adminTicket as any);

      const response = await GET_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets/ticket-1") as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data.attachments[0].download_url).toContain("https://example.com");
    });
  });

  describe("PATCH /api/admin/support/tickets/[ticketId]", () => {
    it("should return 404 when target ticket does not exist", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForAdmin).mockResolvedValue(null as any);

      const response = await PATCH_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toBe("Ticket not found");
    });

    it("should validate patch payload", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForAdmin).mockResolvedValue(adminTicket as any);

      const response = await PATCH_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );

      await expectResponseStatus(response, 400);
    });

    it("should add admin reply and trigger user email notification", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      const { sendSupportTicketReplyEmail } = await import("@/lib/support/email");

      vi.mocked(SupportTickets.getByIdForAdmin)
        .mockResolvedValueOnce(adminTicket as any)
        .mockResolvedValueOnce({
          ...adminTicket,
          messages: [
            {
              id: "m-1",
              ticket_id: "ticket-1",
              author_id: "admin-1",
              actor_type: "admin",
              message: "We are investigating this issue.",
              created_at: "2026-01-01T01:00:00.000Z",
              author: null,
            },
          ],
        } as any);
      vi.mocked(SupportTickets.addMessage).mockResolvedValue({
        id: "m-1",
        created_at: "2026-01-01T01:00:00.000Z",
      } as any);

      const response = await PATCH_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply: "We are investigating this issue." }),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(SupportTickets.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: "ticket-1",
          actorType: "admin",
          authorId: "admin-1",
        })
      );
      expect(sendSupportTicketReplyEmail).toHaveBeenCalledTimes(1);
    });

    it("should update ticket status and add system timeline message", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");

      vi.mocked(SupportTickets.getByIdForAdmin)
        .mockResolvedValueOnce(adminTicket as any)
        .mockResolvedValueOnce({
          ...adminTicket,
          status: "resolved",
        } as any);
      vi.mocked(SupportTickets.updateStatusByAdmin).mockResolvedValue(true as any);
      vi.mocked(SupportTickets.addMessage).mockResolvedValue({ id: "m-system" } as any);

      const response = await PATCH_ADMIN_TICKET(
        new Request("http://localhost:3000/api/admin/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.data.status).toBe("resolved");
      expect(SupportTickets.updateStatusByAdmin).toHaveBeenCalledWith("ticket-1", "resolved");
      expect(SupportTickets.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: "ticket-1",
          actorType: "system",
        })
      );
    });
  });
});
