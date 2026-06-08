import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeActiveBilling,
  ensureBalance,
  postProvisionBilling,
} from "@/config/billing-flow";

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    has_balance: vi.fn(),
    get_balance: vi.fn(),
    deduct: vi.fn(),
    topup: vi.fn(),
    save_transaction: vi.fn(),
  },
}));

describe("Billing flow helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-LIFECYCLE-001: should block provisioning when balance is insufficient", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.has_balance).mockResolvedValue(false);
    vi.mocked(Billing.get_balance).mockResolvedValue(2.5);

    const result = await ensureBalance("user-123", 5);

    expect(Billing.has_balance).toHaveBeenCalledWith("user-123", 5);
    expect(Billing.get_balance).toHaveBeenCalledWith("user-123");
    expect(result).toEqual({ ok: false, balance: 2.5 });
  });

  it("TC-LIFECYCLE-001: should allow provisioning when balance is sufficient", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.has_balance).mockResolvedValue(true);

    const result = await ensureBalance("user-123", 5);

    expect(Billing.has_balance).toHaveBeenCalledWith("user-123", 5);
    expect(Billing.get_balance).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("TC-LIFECYCLE-005: should deduct upfront cost and register active service after provisioning", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.deduct).mockResolvedValue(95 as never);

    const addActive = vi.fn().mockResolvedValue(undefined);

    await postProvisionBilling({
      userId: "user-123",
      initialCost: 5,
      hourlyRate: 0.25,
      serviceId: "svc-123",
      serviceType: "kubernetes",
      addActive,
    });

    expect(Billing.deduct).toHaveBeenCalledWith("user-123", 5);
    expect(addActive).toHaveBeenCalledWith({
      userId: "user-123",
      serviceId: "svc-123",
      hourlyRate: 0.25,
    });
  });

  it("deducts the final usage charge before deleting the active meter", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    const events: string[] = [];
    vi.mocked(Billing.deduct).mockImplementation(async () => {
      events.push("deduct");
      return 90 as never;
    });
    vi.mocked(Billing.save_transaction).mockResolvedValue(undefined as never);

    await closeActiveBilling({
      userId: "user-123",
      serviceId: "svc-123",
      serviceType: "gpu_pod",
      closeActive: async () => ({
        finalCharge: 2.5,
        finalize: async () => {
          events.push("finalize");
        },
      }),
    });

    expect(events).toEqual(["deduct", "finalize"]);
    expect(Billing.topup).not.toHaveBeenCalled();
  });

  it("refunds the final charge when active-meter deletion fails", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.deduct).mockResolvedValue(90 as never);
    vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 92.5 } as never);

    await expect(
      closeActiveBilling({
        userId: "user-123",
        serviceId: "svc-123",
        serviceType: "gpu_volume",
        closeActive: async () => ({
          finalCharge: 2.5,
          finalize: async () => {
            throw new Error("meter delete failed");
          },
        }),
      })
    ).rejects.toThrow("meter delete failed");

    expect(Billing.topup).toHaveBeenCalledWith("user-123", 2.5);
    expect(Billing.save_transaction).not.toHaveBeenCalled();
  });
});
