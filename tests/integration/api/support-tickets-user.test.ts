import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET as GET_TICKETS, POST as POST_TICKETS } from "@/app/api/support/tickets/route";
import {
  GET as GET_TICKET,
  PATCH as PATCH_TICKET,
  POST as POST_TICKET_ATTACHMENTS,
  DELETE as DELETE_TICKET_ATTACHMENT,
} from "@/app/api/support/tickets/[ticketId]/route";
import { GET as GET_RESOURCES } from "@/app/api/support/resources/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/auth/server-auth", () => ({
  authenticateUser: vi.fn(),
}));

vi.mock("@/lib/cooldown/userbased", () => ({
  limitByUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/support/email", () => ({
  sendSupportTicketCreatedEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/support_tickets", () => ({
  SupportTickets: {
    listByUser: vi.fn(),
    create: vi.fn(),
    getByIdForUser: vi.fn(),
    updateByUser: vi.fn(),
    updateStatusByUser: vi.fn(),
    addMessage: vi.fn(),
    addAttachments: vi.fn(),
    deleteAttachmentByUser: vi.fn(),
    listAffectedResources: vi.fn(),
  },
}));

describe("Support Ticket User APIs", () => {
  const mockUser = {
    id: "user-1",
    email: "user1@test.com",
    user_metadata: {
      username: "test-user",
    },
  };

  const baseTicket = {
    id: "ticket-1",
    ticket_number: "TCK-1001",
    status: "open",
    topic: "kubernetes",
    sub_topic: "cluster_health",
    tertiary_topic: "node_not_ready",
    subject: "Node readiness issue",
    description: "<p>Nodes are stuck for more than 20 minutes.</p>",
    affected_resource_type: "kubernetes",
    affected_resource_id: "cluster-1",
    affected_resource_name: "Production cluster",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    latest_message_at: "2026-01-01T00:00:00.000Z",
    resolved_at: null,
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const { authenticateUser } = await import("@/lib/auth/server-auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      authenticated: true,
      user: mockUser as any,
      response: null,
    } as any);

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
            data: { signedUrl: "https://example.com/signed" },
          }),
          upload: vi.fn().mockResolvedValue({ error: null }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as any);

    const { sendSupportTicketCreatedEmail } = await import("@/lib/support/email");
    vi.mocked(sendSupportTicketCreatedEmail).mockResolvedValue({ success: true } as any);

    (File.prototype as any).arrayBuffer = vi.fn(async () => {
      return new TextEncoder().encode("support-file").buffer;
    });
  });

  describe("GET /api/support/tickets", () => {
    it("should return 401 for unauthenticated users", async () => {
      const { authenticateUser } = await import("@/lib/auth/server-auth");
      vi.mocked(authenticateUser).mockResolvedValue({
        authenticated: false,
        user: null,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      } as any);

      const response = await GET_TICKETS(
        new Request("http://localhost:3000/api/support/tickets") as NextRequest
      );
      await expectResponseStatus(response, 401);
    });

    it("should reject invalid status filter", async () => {
      const response = await GET_TICKETS(
        new Request("http://localhost:3000/api/support/tickets?status=bad_status") as NextRequest
      );
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBe("Invalid status filter");
    });

    it("should return grouped open and closed tickets when no status is provided", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.listByUser)
        .mockResolvedValueOnce([baseTicket] as any)
        .mockResolvedValueOnce([{ ...baseTicket, id: "ticket-2", status: "resolved" }] as any);

      const response = await GET_TICKETS(
        new Request("http://localhost:3000/api/support/tickets") as NextRequest
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.data.open).toHaveLength(1);
      expect(data.data.closed).toHaveLength(1);
      expect(data.counts.open).toBe(1);
      expect(data.counts.closed).toBe(1);
    });

    it("should return rate-limit response when request is throttled", async () => {
      const { limitByUser } = await import("@/lib/cooldown/userbased");
      vi.mocked(limitByUser).mockResolvedValue({
        allowed: false,
        retryAfterSec: 25,
      } as any);

      const response = await GET_TICKETS(
        new Request("http://localhost:3000/api/support/tickets") as NextRequest
      );
      const data = await expectResponseStatus(response, 429);

      expect(data.error).toBe("Too Many Requests");
      expect(data.message).toContain("25");
    });
  });

  describe("POST /api/support/tickets", () => {
    it("should validate required payload fields", async () => {
      const response = await POST_TICKETS(
        new Request("http://localhost:3000/api/support/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }) as NextRequest
      );

      await expectResponseStatus(response, 400);
    });

    it("should create a ticket and send confirmation email", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      const { sendSupportTicketCreatedEmail } = await import("@/lib/support/email");

      vi.mocked(SupportTickets.create).mockResolvedValue({
        ticket: baseTicket,
        messageId: "message-1",
      } as any);
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        messages: [],
        attachments: [],
      } as any);

      const payload = {
        topic: "kubernetes",
        subTopic: "cluster_health",
        tertiaryTopic: "node_not_ready",
        subject: "Node readiness issue",
        affectedResourceType: "kubernetes",
        affectedResourceId: "cluster-1",
        affectedResourceName: "Production cluster",
        description: "<p>Nodes are stuck for more than 20 minutes.</p>",
      };

      const response = await POST_TICKETS(
        new Request("http://localhost:3000/api/support/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }) as NextRequest
      );
      const data = await expectResponseStatus(response, 201);

      expect(data.success).toBe(true);
      expect(data.data.id).toBe("ticket-1");
      expect(SupportTickets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "user-1",
          topic: "kubernetes",
          subTopic: "cluster_health",
          tertiaryTopic: "node_not_ready",
        })
      );
      expect(sendSupportTicketCreatedEmail).toHaveBeenCalledTimes(1);
    });

    it("should reject unsupported file extensions", async () => {
      const formData = new FormData();
      formData.append("topic", "kubernetes");
      formData.append("subTopic", "cluster_health");
      formData.append("tertiaryTopic", "node_not_ready");
      formData.append("subject", "Node readiness issue");
      formData.append("description", "<p>Nodes are stuck for more than 20 minutes.</p>");
      formData.append("attachments", new File(["binary"], "malware.exe", { type: "application/octet-stream" }));

      const response = await POST_TICKETS({
        headers: new Headers({ "content-type": "multipart/form-data" }),
        formData: vi.fn().mockResolvedValue(formData),
      } as unknown as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain("not supported");
    });

    it("should reject when attachments exceed configured maximum", async () => {
      const formData = new FormData();
      formData.append("topic", "kubernetes");
      formData.append("subTopic", "cluster_health");
      formData.append("tertiaryTopic", "node_not_ready");
      formData.append("subject", "Node readiness issue");
      formData.append("description", "<p>Nodes are stuck for more than 20 minutes.</p>");

      for (let i = 0; i < 7; i += 1) {
        formData.append("attachments", new File([`file-${i}`], `log-${i}.txt`, { type: "text/plain" }));
      }

      const response = await POST_TICKETS({
        headers: new Headers({ "content-type": "multipart/form-data" }),
        formData: vi.fn().mockResolvedValue(formData),
      } as unknown as NextRequest);
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toContain("Maximum");
    });
  });

  describe("GET /api/support/tickets/[ticketId]", () => {
    it("should return 404 when ticket is missing", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue(null as any);

      const response = await GET_TICKET(
        new Request("http://localhost:3000/api/support/tickets/ticket-1") as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toBe("Ticket not found");
    });

    it("should include can_edit and can_reopen flags with signed attachment URLs", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        status: "resolved",
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
      } as any);

      const response = await GET_TICKET(
        new Request("http://localhost:3000/api/support/tickets/ticket-1") as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.data.can_edit).toBe(false);
      expect(data.data.can_reopen).toBe(true);
      expect(data.data.attachments[0].download_url).toContain("https://example.com");
    });
  });

  describe("PATCH /api/support/tickets/[ticketId]", () => {
    it("should reopen eligible closed tickets", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser)
        .mockResolvedValueOnce({
          ...baseTicket,
          status: "closed",
          messages: [],
          attachments: [],
        } as any)
        .mockResolvedValueOnce({
          ...baseTicket,
          status: "open",
          messages: [],
          attachments: [],
        } as any);
      vi.mocked(SupportTickets.updateStatusByUser).mockResolvedValue(true as any);
      vi.mocked(SupportTickets.addMessage).mockResolvedValue({ id: "m-1" } as any);

      const response = await PATCH_TICKET(
        new Request("http://localhost:3000/api/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reopen" }),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(SupportTickets.updateStatusByUser).toHaveBeenCalledWith("user-1", "ticket-1", "open");
      expect(SupportTickets.addMessage).toHaveBeenCalled();
    });

    it("should block reopen action for permanently closed tickets", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        status: "permantly_close",
        messages: [],
        attachments: [],
      } as any);

      const response = await PATCH_TICKET(
        new Request("http://localhost:3000/api/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reopen" }),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toContain("cannot be reopened");
    });

    it("should reject direct edits on closed tickets", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        status: "resolved",
        messages: [],
        attachments: [],
      } as any);

      const response = await PATCH_TICKET(
        new Request("http://localhost:3000/api/support/tickets/ticket-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: "Updated subject",
            description: "<p>A refreshed description that has enough characters.</p>",
          }),
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toContain("Reopen first");
    });
  });

  describe("POST /api/support/tickets/[ticketId] (attachments)", () => {
    it("should upload new attachments for open tickets", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser)
        .mockResolvedValueOnce({
          ...baseTicket,
          status: "open",
          messages: [],
          attachments: [],
        } as any)
        .mockResolvedValueOnce({
          ...baseTicket,
          status: "open",
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
        } as any);
      vi.mocked(SupportTickets.addAttachments).mockResolvedValue(true as any);
      vi.mocked(SupportTickets.addMessage).mockResolvedValue({ id: "m-1" } as any);

      const formData = new FormData();
      formData.append("attachments", new File(["log"], "trace.txt", { type: "text/plain" }));

      const response = await POST_TICKET_ATTACHMENTS(
        {
          formData: vi.fn().mockResolvedValue(formData),
        } as unknown as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(SupportTickets.addAttachments).toHaveBeenCalledTimes(1);
      expect(SupportTickets.addMessage).toHaveBeenCalledTimes(1);
    });

    it("should reject attachment uploads for closed tickets", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        status: "closed",
        messages: [],
        attachments: [],
      } as any);

      const formData = new FormData();
      formData.append("attachments", new File(["log"], "trace.txt", { type: "text/plain" }));

      const response = await POST_TICKET_ATTACHMENTS(
        {
          formData: vi.fn().mockResolvedValue(formData),
        } as unknown as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 409);

      expect(data.error).toContain("open tickets");
    });
  });

  describe("DELETE /api/support/tickets/[ticketId] (attachment removal)", () => {
    it("should delete attachment for open tickets", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        status: "open",
        messages: [],
        attachments: [],
      } as any);
      vi.mocked(SupportTickets.deleteAttachmentByUser).mockResolvedValue({
        id: "att-1",
        file_path: "user-1/ticket-1/trace.txt",
      } as any);
      vi.mocked(SupportTickets.addMessage).mockResolvedValue({ id: "m-1" } as any);

      const response = await DELETE_TICKET_ATTACHMENT(
        new Request("http://localhost:3000/api/support/tickets/ticket-1?attachmentId=att-1", {
          method: "DELETE",
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(SupportTickets.deleteAttachmentByUser).toHaveBeenCalledWith("user-1", "ticket-1", "att-1");
    });

    it("should return 404 if attachment deletion target is not found", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.getByIdForUser).mockResolvedValue({
        ...baseTicket,
        status: "open",
        messages: [],
        attachments: [],
      } as any);
      vi.mocked(SupportTickets.deleteAttachmentByUser).mockResolvedValue(null as any);

      const response = await DELETE_TICKET_ATTACHMENT(
        new Request("http://localhost:3000/api/support/tickets/ticket-1?attachmentId=missing", {
          method: "DELETE",
        }) as NextRequest,
        { params: Promise.resolve({ ticketId: "ticket-1" }) }
      );
      const data = await expectResponseStatus(response, 404);

      expect(data.error).toContain("Attachment not found");
    });
  });

  describe("GET /api/support/resources", () => {
    it("should return 400 for invalid topic", async () => {
      const response = await GET_RESOURCES(
        new Request("http://localhost:3000/api/support/resources?topic=unknown") as NextRequest
      );
      const data = await expectResponseStatus(response, 400);

      expect(data.error).toBeDefined();
    });

    it("should return affected resources for selected topic", async () => {
      const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
      vi.mocked(SupportTickets.listAffectedResources).mockResolvedValue([
        { id: "general", name: "General Kubernetes issue", type: "kubernetes" },
        { id: "cluster-1", name: "Production cluster", type: "kubernetes", status: "running" },
      ] as any);

      const response = await GET_RESOURCES(
        new Request("http://localhost:3000/api/support/resources?topic=kubernetes") as NextRequest
      );
      const data = await expectResponseStatus(response, 200);

      expect(data.success).toBe(true);
      expect(data.topic.id).toBe("kubernetes");
      expect(data.data).toHaveLength(2);
    });
  });
});
