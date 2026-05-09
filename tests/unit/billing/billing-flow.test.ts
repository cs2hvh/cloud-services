import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    has_balance: vi.fn(),
    get_balance: vi.fn(),
    deduct: vi.fn(),
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
});
