import { beforeEach, describe, expect, it, vi } from "vitest";
import { Billing } from "@/lib/supabase/queries/billing";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

describe("Billing transaction security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-BILL-SEC-005: should default all billing transaction currency to usd", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const insert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(createServiceClient).mockResolvedValue({
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert,
        }),
      }),
    } as never);

    await Billing.save_transaction({
      userId: "user-123",
      amount: 25,
      status: "completed",
      type: "topup",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        amount: 25,
        currency: "usd",
      })
    );
  });
});
