import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Billing } from "@/lib/supabase/queries/billing";
import { closeMeter } from "@/lib/billing/meters";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

// close_active_service closes the v2 meter itself, before it reads the v1 row.
// The real closeMeter would reach for the (mocked) service client.
vi.mock("@/lib/billing/meters", () => ({
  closeMeter: vi.fn().mockResolvedValue(undefined),
}));

function makeCloseServiceClient(activeRow: {
  user_id: string;
  service_id: string;
  hourly_rate: number;
  last_billed_at: string;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: activeRow,
    error: null,
  });

  const selectUserEq = vi.fn().mockReturnValue({
    maybeSingle,
  });
  const selectServiceEq = vi.fn().mockReturnValue({
    eq: selectUserEq,
  });

  const deleteUserEq = vi.fn().mockResolvedValue({ error: null });
  const deleteServiceEq = vi.fn().mockReturnValue({
    eq: deleteUserEq,
  });

  // Present only so the test can prove they are never touched: no arrears row
  // is written and no credit is moved at teardown.
  const insert = vi.fn();
  const rpc = vi.fn();

  const client = {
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: selectServiceEq,
        }),
        delete: vi.fn().mockReturnValue({
          eq: deleteServiceEq,
        }),
        insert,
      }),
      rpc,
    }),
    rpc,
  };

  return { client, deleteServiceEq, deleteUserEq, selectServiceEq, selectUserEq, insert, rpc };
}

describe("Billing lifecycle operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T12:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // THE V1 "FINAL PRORATED CHARGE" IS NO LONGER DEDUCTED. It was computed as
  // hourly_rate x (now - last_billed_at), and last_billed_at was advanced only
  // by the old cron worker, gone since 2026-08-24. At teardown it therefore
  // resolved to the ENTIRE lifetime of the resource, every hour of which the
  // v2 sweep had already billed. Found 2026-09-03.
  it("TC-LIFECYCLE-002: service deletion does NOT deduct the v1 final prorated charge; it closes the v2 meter and removes the v1 row", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client, deleteServiceEq, deleteUserEq, selectServiceEq, insert, rpc } =
      makeCloseServiceClient({
        user_id: "user-owner",
        service_id: "svc-1",
        hourly_rate: 0.2,
        last_billed_at: "2026-03-23T11:30:00.000Z", // v1 would have computed $0.10
      });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const deductSpy = vi.spyOn(Billing, "deduct").mockResolvedValue(49.9 as never);
    const moveCreditSpy = vi
      .spyOn(Billing, "move_credit")
      .mockResolvedValue(undefined as never);

    const result = await Billing.close_active_service("database", {
      userId: "request-user",
      serviceId: "svc-1",
    });

    // Nothing is charged, moved, or recorded as arrears.
    expect(deductSpy).not.toHaveBeenCalled();
    expect(moveCreditSpy).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ charged: 0, newBalance: null });

    // The v2 meter is closed FIRST, before the v1 row is even read.
    expect(closeMeter).toHaveBeenCalledTimes(1);
    expect(closeMeter).toHaveBeenCalledWith("database", "svc-1");
    expect(vi.mocked(closeMeter).mock.invocationCallOrder[0]).toBeLessThan(
      selectServiceEq.mock.invocationCallOrder[0]
    );

    // The v1 row still goes: some provisioning paths read its presence as
    // "already billed".
    expect(deleteServiceEq).toHaveBeenCalledWith("service_id", "svc-1");
    expect(deleteUserEq).toHaveBeenCalledWith("user_id", "request-user");
  });

  it("TC-LIFECYCLE-003: deletion with failOnInsufficient=false still removes the v1 row and closes the meter; there is no final charge left to fail", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client, deleteServiceEq, deleteUserEq, insert } = makeCloseServiceClient({
      user_id: "user-owner",
      service_id: "svc-2",
      hourly_rate: 1,
      last_billed_at: "2026-03-23T11:00:00.000Z", // v1 would have computed $1.00
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    // Were the deduction still attempted, this would have been the failure.
    const deductSpy = vi
      .spyOn(Billing, "deduct")
      .mockRejectedValue(new Error("Insufficient balance"));

    const result = await Billing.close_active_service("kubernetes", {
      userId: "request-user",
      serviceId: "svc-2",
      failOnInsufficient: false,
    });

    expect(deductSpy).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual({ charged: 0, newBalance: null });
    expect(closeMeter).toHaveBeenCalledWith("kubernetes", "svc-2");
    expect(deleteServiceEq).toHaveBeenCalledWith("service_id", "svc-2");
    expect(deleteUserEq).toHaveBeenCalledWith("user_id", "request-user");
  });

  it("TC-LIFECYCLE-003b: a failing v2 meter close does not stop the v1 row from being removed", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client, deleteServiceEq, deleteUserEq } = makeCloseServiceClient({
      user_id: "user-owner",
      service_id: "svc-3",
      hourly_rate: 0.5,
      last_billed_at: "2026-03-23T11:00:00.000Z",
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    vi.mocked(closeMeter).mockRejectedValueOnce(new Error("meter close failed"));
    const deductSpy = vi.spyOn(Billing, "deduct").mockResolvedValue(0 as never);

    const result = await Billing.close_active_service("objectspace", {
      userId: "request-user",
      serviceId: "svc-3",
    });

    expect(closeMeter).toHaveBeenCalledWith("objectspace", "svc-3");
    expect(deductSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ charged: 0, newBalance: null });
    expect(deleteServiceEq).toHaveBeenCalledWith("service_id", "svc-3");
    expect(deleteUserEq).toHaveBeenCalledWith("user_id", "request-user");
  });

  it("TC-LIFECYCLE-004: platform app resize should update hourly rate for active service only", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    const select = vi.fn().mockResolvedValue({ data: [{ service_id: "app-1" }], error: null });
    const statusEq = vi.fn().mockReturnValue({ select });
    const serviceEq = vi.fn().mockReturnValue({
      eq: statusEq,
    });
    const update = vi.fn().mockReturnValue({
      eq: serviceEq,
    });

    const client = {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          update,
        }),
      }),
    };
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const result = await Billing.update_active_platform_app_rate({
      serviceId: "app-1",
      newHourlyRate: 0.25,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        hourly_rate: 0.25,
        updated_at: expect.any(String),
      })
    );
    expect(serviceEq).toHaveBeenCalledWith("service_id", "app-1");
    expect(statusEq).toHaveBeenCalledWith("status", "active");
    expect(select).toHaveBeenCalledWith("service_id");
    expect(result).toEqual({ updated: true });
  });
});
