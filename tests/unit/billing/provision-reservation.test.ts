import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reserveProvision,
  settleProvision,
  releaseProvision,
} from "@/config/billing-flow";

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    deduct: vi.fn(),
    topup: vi.fn(),
    get_balance: vi.fn(),
    save_transaction: vi.fn(),
  },
}));

describe("Provisioning reservation primitives (C2/C3 free-fleet gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reserveProvision atomically holds (setup + 1h) before provisioning", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.deduct).mockResolvedValue(94.75 as never);

    const r = await reserveProvision({ userId: "u1", initialCost: 5, hourlyRate: 0.25 });

    expect(Billing.deduct).toHaveBeenCalledWith("u1", 5.25);
    expect(r.ok).toBe(true);
    expect(r.reservation.reserved).toBe(5.25);
  });

  it("reserveProvision rejects (no provisioning) when the hold can't be covered", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.deduct).mockRejectedValue(new Error("Insufficient balance"));
    vi.mocked(Billing.get_balance).mockResolvedValue(1.0);

    const r = await reserveProvision({ userId: "u1", initialCost: 5, hourlyRate: 0.25 });

    expect(r.ok).toBe(false);
    expect(r.balance).toBe(1.0);
    expect(r.reservation.reserved).toBe(0);
  });

  it("reserveProvision is a no-op gate for a zero-cost service", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");

    const r = await reserveProvision({ userId: "u1", initialCost: 0, hourlyRate: 0 });

    expect(Billing.deduct).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.reservation.reserved).toBe(0);
  });

  it("settleProvision registers the meter, refunds only the 1h hold, and records the setup charge", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 95 } as never);
    vi.mocked(Billing.get_balance).mockResolvedValue(95);
    vi.mocked(Billing.save_transaction).mockResolvedValue(undefined as never);
    const addActive = vi.fn().mockResolvedValue(undefined);

    await settleProvision({
      reservation: { userId: "u1", reserved: 5.25 },
      initialCost: 5,
      hourlyRate: 0.25,
      serviceId: "svc1",
      serviceType: "database",
      addActive,
    });

    expect(addActive).toHaveBeenCalledWith({ userId: "u1", serviceId: "svc1", hourlyRate: 0.25 });
    // Only the transient hour-hold is refunded; the $5 setup stays charged.
    expect(Billing.topup).toHaveBeenCalledTimes(1);
    expect(Billing.topup).toHaveBeenCalledWith("u1", 0.25);
    expect(Billing.save_transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Billing.save_transaction).mock.calls[0][0]).toMatchObject({
      type: "setup",
      amount: 5,
      serviceType: "database",
    });
  });

  it("settleProvision throws WITHOUT refunding if the meter insert fails (caller's finally refunds once)", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    const addActive = vi.fn().mockRejectedValue(new Error("active row insert failed"));

    await expect(
      settleProvision({
        reservation: { userId: "u1", reserved: 5.25 },
        initialCost: 5,
        hourlyRate: 0.25,
        serviceId: "svc1",
        serviceType: "database",
        addActive,
      })
    ).rejects.toThrow("active row insert failed");

    // No partial refund inside settle — the caller's finally → releaseProvision owns it.
    expect(Billing.topup).not.toHaveBeenCalled();
    expect(Billing.save_transaction).not.toHaveBeenCalled();
  });

  it("releaseProvision refunds the FULL reservation and never throws", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.topup).mockResolvedValue({ credit_balance: 100 } as never);

    await releaseProvision({ userId: "u1", reserved: 5.25 });

    expect(Billing.topup).toHaveBeenCalledWith("u1", 5.25);
  });

  it("releaseProvision swallows refund errors (logged, not thrown)", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.topup).mockRejectedValue(new Error("network"));

    await expect(releaseProvision({ userId: "u1", reserved: 5.25 })).resolves.toBeUndefined();
  });

  it("CONSERVATION: reserve+settle nets exactly the setup charge; reserve+release nets zero", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");

    let net = 0;
    vi.mocked(Billing.deduct).mockImplementation(async (_u: string, amt: number) => {
      net += amt;
      return 100 - net;
    });
    vi.mocked(Billing.topup).mockImplementation(async (_u: string, amt: number) => {
      net -= amt;
      return { credit_balance: 100 - net } as never;
    });
    vi.mocked(Billing.get_balance).mockResolvedValue(95);
    vi.mocked(Billing.save_transaction).mockResolvedValue(undefined as never);

    // Happy path: reserve (−5.25) then settle (+0.25) ⇒ net −5.00 (= the setup charge).
    const r1 = await reserveProvision({ userId: "u1", initialCost: 5, hourlyRate: 0.25 });
    await settleProvision({
      reservation: r1.reservation,
      initialCost: 5,
      hourlyRate: 0.25,
      serviceId: "svc1",
      serviceType: "database",
      addActive: vi.fn().mockResolvedValue(undefined),
    });
    expect(net).toBeCloseTo(5.0, 6);

    // Failed path: reserve (−0.25) then release (+0.25) ⇒ net unchanged (no money moved).
    net = 0;
    const r2 = await reserveProvision({ userId: "u2", initialCost: 0, hourlyRate: 0.25 });
    await releaseProvision(r2.reservation);
    expect(net).toBeCloseTo(0, 6);
  });
});
