import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/billing/transactions/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    get_transactions: vi.fn(),
  },
}));

const TEST_URL = "http://localhost:3000/api/billing/transactions";

function createRequest(query = ""): Request {
  return new Request(`${TEST_URL}${query}`, { method: "GET" });
}

describe("GET /api/billing/transactions", () => {
  const sampleTransactions = [
    {
      id: "txn_123",
      stripe_session_id: "cs_test_123",
      amount: 50,
      currency: "usd",
      status: "completed",
      type: "topup",
      balance_after: 150,
      description: null,
      receipt_url: "https://stripe.com/receipts/ch_123",
      created_at: "2026-03-20T10:00:00.000Z",
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-123",
              email: "test@example.com",
            },
          },
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_transactions).mockResolvedValue({
      transactions: sampleTransactions,
      total: 21,
    } as never);
  });

  it("TC-TXN-001: should return paginated transactions with correct offset math", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    const response = await GET(createRequest("?page=2&limit=10"));
    const data = await expectResponseStatus(response, 200);

    expect(Billing.get_transactions).toHaveBeenCalledWith("user-123", {
      limit: 10,
      offset: 10,
      status: undefined,
      type: undefined,
      from: undefined,
      to: undefined,
    });
    expect(data.success).toBe(true);
    expect(data.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });

  it("TC-TXN-002: should forward status/type/date filters to query layer", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    const from = "2026-03-01T00:00:00.000Z";
    const to = "2026-03-21T23:59:59.999Z";
    const response = await GET(
      createRequest(
        `?page=1&limit=20&status=completed&type=coupon&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
    );
    await expectResponseStatus(response, 200);

    expect(Billing.get_transactions).toHaveBeenCalledWith("user-123", {
      limit: 20,
      offset: 0,
      status: "completed",
      type: "coupon",
      from,
      to,
    });
  });

  it("TC-TXN-003: should enforce user isolation (ignore any foreign user_id query)", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    const response = await GET(createRequest("?user_id=attacker-user&limit=20&page=1"));
    await expectResponseStatus(response, 200);

    expect(Billing.get_transactions).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        limit: 20,
        offset: 0,
      })
    );
    expect(Billing.get_transactions).not.toHaveBeenCalledWith(
      "attacker-user",
      expect.anything()
    );
  });

  it("TC-TXN-004: should return complete transaction record fields", async () => {
    const response = await GET(createRequest("?page=1&limit=20"));
    const data = await expectResponseStatus(response, 200);

    expect(data.data).toHaveLength(1);
    expect(data.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        stripe_session_id: expect.any(String),
        amount: expect.any(Number),
        currency: expect.any(String),
        status: expect.any(String),
        type: expect.any(String),
        balance_after: expect.any(Number),
        description: null,
        receipt_url: expect.any(String),
        created_at: expect.any(String),
      })
    );
  });

  it("TC-BILL-SEC-003: should not leak internal errors from transactions endpoint", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_transactions).mockRejectedValueOnce(
      new Error("DB error: relation billing.transactions does not exist")
    );

    const response = await GET(createRequest("?page=1&limit=20"));
    const data = await expectResponseStatus(response, 500);

    expect(data.error).toBe("Failed to fetch transactions");
    expect(data.error).not.toContain("relation");
  });
});
