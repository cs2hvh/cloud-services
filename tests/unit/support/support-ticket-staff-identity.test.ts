import { describe, expect, it, vi } from "vitest";

// A customer loading their own ticket must never receive a staff member's
// name, email or user id: staff replies arrive with no author at all, and the
// page shows them as "Support Team". The customer's own messages keep their
// author. Runs the real loader against a small in-memory fake of the tables.

const OWNER = "owner-1";
const STAFF = "staff-1";

const rows: Record<string, Array<Record<string, unknown>>> = {
  support_tickets: [
    {
      id: "t-1",
      owner_id: OWNER,
      ticket_number: "AS-1",
      status: "open",
      topic: "billing",
      subject: "Help",
      description: "d",
      created_at: "2026-09-27T00:00:00Z",
      updated_at: "2026-09-27T00:00:00Z",
      latest_message_at: "2026-09-27T00:00:00Z",
      resolved_at: null,
    },
  ],
  support_ticket_messages: [
    { id: "m-1", ticket_id: "t-1", author_id: OWNER, actor_type: "user", message: "hi", created_at: "2026-09-27T00:01:00Z" },
    { id: "m-2", ticket_id: "t-1", author_id: STAFF, actor_type: "admin", message: "hello", created_at: "2026-09-27T00:02:00Z" },
  ],
  support_ticket_attachments: [],
  user_profiles: [
    { id: OWNER, username: "cust", display_name: "Customer", avatar: null },
    { id: STAFF, username: "jane.staff", display_name: "Jane Staff", avatar: null },
  ],
};

function query(table: string) {
  let data = [...(rows[table] ?? [])];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      data = data.filter((r) => r[col] === val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      data = data.filter((r) => vals.includes(r[col]));
      return q;
    },
    order: () => q,
    maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data, error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    schema: () => ({ from: query }),
    from: query,
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              { id: OWNER, email: "customer@example.com" },
              { id: STAFF, email: "jane.staff@ahurasense.com" },
            ],
          },
          error: null,
        }),
      },
    },
  }),
  createClient: async () => ({}),
}));

describe("customer ticket view hides staff identity", () => {
  it("strips author and author id from staff replies, keeps the customer's own", async () => {
    const { SupportTickets } = await import("@/lib/supabase/queries/support_tickets");
    const ticket = await SupportTickets.getByIdForUser(OWNER, "t-1");
    expect(ticket).not.toBeNull();

    const staffReply = ticket!.messages.find((m) => m.actor_type === "admin")!;
    expect(staffReply.author).toBeNull();
    expect(staffReply.author_id).toBeNull();

    const own = ticket!.messages.find((m) => m.actor_type === "user")!;
    expect(own.author?.email).toBe("customer@example.com");

    const wire = JSON.stringify(ticket);
    expect(wire).not.toContain("jane.staff@ahurasense.com");
    expect(wire).not.toContain("Jane Staff");
    expect(wire).not.toContain(STAFF);
  });
});
