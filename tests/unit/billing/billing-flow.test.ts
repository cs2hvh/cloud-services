import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeActiveBilling, ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { closeMeter } from "@/lib/billing/meters";

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    has_balance: vi.fn(),
    get_balance: vi.fn(),
    deduct: vi.fn(),
    save_transaction: vi.fn(),
  },
}));

vi.mock("@/lib/billing/meters", () => ({
  openMeter: vi.fn().mockResolvedValue(undefined),
  closeMeter: vi.fn().mockResolvedValue(undefined),
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

  // closeActiveBilling: the v1 "final prorated charge" is no longer deducted.
  // hourly_rate × (now − last_billed_at) resolved to the resource's ENTIRE
  // lifetime once the old cron stopped advancing last_billed_at (2026-08-24),
  // every hour of which the v2 sweep had already billed. Found 2026-09-03.
  describe("closeActiveBilling", () => {
    it("TC-LIFECYCLE-006: closes the v1 row and the v2 meter, and deducts nothing", async () => {
      const { Billing } = await import("@/lib/supabase/queries/billing");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const closeActive = vi.fn().mockResolvedValue(0.1); // what v1 would have charged

      await closeActiveBilling({
        userId: "user-123",
        serviceId: "svc-123",
        serviceType: "compute",
        closeActive,
      });

      expect(closeActive).toHaveBeenCalledTimes(1);
      expect(closeMeter).toHaveBeenCalledTimes(1);
      expect(closeMeter).toHaveBeenCalledWith("compute", "svc-123");
      expect(Billing.deduct).not.toHaveBeenCalled();
      expect(Billing.save_transaction).not.toHaveBeenCalled();
      // The v1 figure is kept for the log so the two models can be compared.
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("not deducted"));
      logSpy.mockRestore();
    });

    it("TC-LIFECYCLE-007: a throwing closeActive still closes the meter and does not throw", async () => {
      const { Billing } = await import("@/lib/supabase/queries/billing");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const closeActive = vi.fn().mockRejectedValue(new Error("active row read failed"));

      await expect(
        closeActiveBilling({
          userId: "user-123",
          serviceId: "svc-123",
          serviceType: "kubernetes",
          closeActive,
        })
      ).resolves.toBeUndefined();

      // A meter that outlives its resource is what charged one customer
      // $4,629.91 for a deleted bucket.
      expect(closeMeter).toHaveBeenCalledTimes(1);
      expect(closeMeter).toHaveBeenCalledWith("kubernetes", "svc-123");
      expect(Billing.deduct).not.toHaveBeenCalled();
      expect(Billing.save_transaction).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("TC-LIFECYCLE-008: a failing meter close is logged, not thrown", async () => {
      const { Billing } = await import("@/lib/supabase/queries/billing");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(closeMeter).mockRejectedValueOnce(new Error("meter close failed"));
      const closeActive = vi.fn().mockResolvedValue(0);

      await expect(
        closeActiveBilling({
          userId: "user-123",
          serviceId: "svc-123",
          serviceType: "database",
          closeActive,
        })
      ).resolves.toBeUndefined();

      expect(closeActive).toHaveBeenCalledTimes(1);
      expect(closeMeter).toHaveBeenCalledWith("database", "svc-123");
      expect(Billing.deduct).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
