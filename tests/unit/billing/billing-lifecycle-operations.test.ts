import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Billing } from "@/lib/supabase/queries/billing";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
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

  const client = {
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: selectServiceEq,
        }),
        delete: vi.fn().mockReturnValue({
          eq: deleteServiceEq,
        }),
      }),
    }),
  };

  return { client, deleteServiceEq, deleteUserEq, selectServiceEq, selectUserEq };
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

  it("TC-LIFECYCLE-002: service deletion should charge prorated final amount", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client } = makeCloseServiceClient({
      user_id: "user-owner",
      service_id: "svc-1",
      hourly_rate: 0.2,
      last_billed_at: "2026-03-23T11:30:00.000Z",
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    const deductSpy = vi.spyOn(Billing, "deduct").mockResolvedValue(49.9 as never);

    const result = await Billing.close_active_service("database", {
      userId: "request-user",
      serviceId: "svc-1",
    });

    expect(deductSpy).toHaveBeenCalledTimes(1);
    expect(deductSpy.mock.calls[0][0]).toBe("user-owner");
    expect(deductSpy.mock.calls[0][1]).toBeCloseTo(0.1, 4);
    expect(result.charged).toBeCloseTo(0.1, 4);
    expect(result.newBalance).toBe(49.9);
  });

  it("TC-LIFECYCLE-003: deletion should proceed when final-charge deduction fails with failOnInsufficient=false", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { client, deleteServiceEq, deleteUserEq } = makeCloseServiceClient({
      user_id: "user-owner",
      service_id: "svc-2",
      hourly_rate: 1,
      last_billed_at: "2026-03-23T11:00:00.000Z",
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);

    vi.spyOn(Billing, "deduct").mockRejectedValueOnce(new Error("Insufficient balance"));

    const result = await Billing.close_active_service("kubernetes", {
      userId: "request-user",
      serviceId: "svc-2",
      failOnInsufficient: false,
    });

    expect(result.charged).toBeCloseTo(1, 4);
    expect(result.newBalance).toBeNull();
    expect(deleteServiceEq).toHaveBeenCalledWith("service_id", "svc-2");
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
