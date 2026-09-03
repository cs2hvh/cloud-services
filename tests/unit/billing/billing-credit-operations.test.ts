import { beforeEach, describe, expect, it, vi } from "vitest";
import { Billing } from "@/lib/supabase/queries/billing";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

function makeTopupClient(options: {
  existing: { credit_balance: number } | null;
  rpcResult?: { data: number | null; error: { message: string } | null };
  insertBalance?: number;
  fallbackBalance?: number;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options.existing,
    error: null,
  });

  const insertSingle = vi.fn().mockResolvedValue({
    data:
      options.insertBalance !== undefined
        ? { credit_balance: options.insertBalance }
        : null,
    error: null,
  });

  const fallbackSingle = vi.fn().mockResolvedValue({
    data:
      options.fallbackBalance !== undefined
        ? { credit_balance: options.fallbackBalance }
        : null,
    error: null,
  });

  const fromObj = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle,
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: insertSingle,
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: fallbackSingle,
        }),
      }),
    }),
  };

  return {
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(fromObj),
    }),
    rpc: vi
      .fn()
      .mockResolvedValue(
        options.rpcResult ?? { data: null, error: { message: "RPC unavailable" } }
      ),
    __from: fromObj,
  };
}

describe("Billing credit operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-CREDIT-001: topup should use atomic billing_topup RPC when user already exists", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const client = makeTopupClient({
      existing: { credit_balance: 100 },
      rpcResult: { data: 150, error: null },
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const result = await Billing.topup("user-123", 50);

    expect(client.rpc).toHaveBeenCalledWith("billing_topup", {
      p_user_id: "user-123",
      p_amount: 50,
    });
    expect(result.credit_balance).toBe(150);
  });

  it("TC-CREDIT-002: topup should create first-time user credit record", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const client = makeTopupClient({
      existing: null,
      insertBalance: 50,
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const result = await Billing.topup("new-user", 50);

    expect(client.__from.insert).toHaveBeenCalledWith({
      user_id: "new-user",
      credit_balance: 50,
    });
    expect(result.credit_balance).toBe(50);
  });

  it("TC-CREDIT-003: topup should fallback to update path when RPC is unavailable", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const client = makeTopupClient({
      existing: { credit_balance: 100 },
      rpcResult: { data: null, error: { message: "function billing_topup not found" } },
      fallbackBalance: 150,
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const result = await Billing.topup("user-123", 50);

    expect(client.rpc).toHaveBeenCalledWith("billing_topup", {
      p_user_id: "user-123",
      p_amount: 50,
    });
    expect(client.__from.update).toHaveBeenCalledWith({ credit_balance: 150 });
    expect(result.credit_balance).toBe(150);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("TC-CREDIT-004: deduct should succeed when funds are sufficient", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: 80, error: null }),
    };
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const result = await Billing.deduct("user-123", 20);

    expect(client.rpc).toHaveBeenCalledWith("billing_deduct", {
      p_user_id: "user-123",
      p_amount: 20,
    });
    expect(result).toBe(80);
  });

  it("TC-CREDIT-005: deduct should reject when balance is insufficient", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: -1, error: null }),
    };
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    await expect(Billing.deduct("user-123", 50)).rejects.toThrow(
      "Insufficient balance"
    );
  });

  it("TC-CREDIT-006: deduct should prevent concurrent overdraw via atomic RPC result", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const client = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: 20, error: null })
        .mockResolvedValueOnce({ data: -1, error: null }),
    };
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const results = await Promise.allSettled([
      Billing.deduct("user-123", 30),
      Billing.deduct("user-123", 30),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  // get_balance reads with maybeSingle: a user with no user_credits row is a
  // null row (an honest $0); a failed read is an error and must NOT be $0.
  function makeBalanceClient(result: {
    data: { credit_balance: number } | null;
    error: { message: string } | null;
  }) {
    return {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      }),
    };
  }

  it("TC-CREDIT-007: get_balance should return real balance for existing user and 0 for missing user", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    vi.mocked(createServiceClient)
      .mockResolvedValueOnce(makeBalanceClient({ data: { credit_balance: 42 }, error: null }) as never)
      .mockResolvedValueOnce(makeBalanceClient({ data: null, error: null }) as never);

    const existingBalance = await Billing.get_balance("user-existing");
    const missingBalance = await Billing.get_balance("user-missing");

    expect(existingBalance).toBe(42);
    expect(missingBalance).toBe(0);
  });

  it("TC-CREDIT-008: get_balance should throw when the read fails rather than report $0", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    vi.mocked(createServiceClient).mockResolvedValueOnce(
      makeBalanceClient({ data: null, error: { message: "connection reset" } }) as never
    );

    // A $0 here would both block a funded customer and let a provisioning
    // refund vanish.
    await expect(Billing.get_balance("user-unreadable")).rejects.toThrow(
      "Balance read failed for user-unreadable: connection reset"
    );
  });

  it("TC-BILL-SEC-001: topup should reject negative or non-finite amounts", async () => {
    await expect(Billing.topup("user-123", -10)).rejects.toThrow(
      "Top-up amount must be a positive number"
    );
    await expect(Billing.topup("user-123", Number.NaN)).rejects.toThrow(
      "Top-up amount must be a positive number"
    );
  });

  it("TC-BILL-SEC-001: deduct should reject negative or non-finite amounts", async () => {
    await expect(Billing.deduct("user-123", -1)).rejects.toThrow(
      "Deduction amount must be a positive number"
    );
    await expect(Billing.deduct("user-123", Number.POSITIVE_INFINITY)).rejects.toThrow(
      "Deduction amount must be a positive number"
    );
  });
});
