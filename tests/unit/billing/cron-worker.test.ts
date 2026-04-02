import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

type ActiveService = {
  service_id: string;
  user_id: string;
  hourly_rate: number | string;
  last_billed_at?: string | null;
  created_at?: string | null;
};

type SupabaseHarnessOptions = {
  servicesByTable?: Record<string, ActiveService[]>;
  fetchErrorsByTable?: Record<string, { message: string; code?: string } | null>;
  updateErrorsByServiceId?: Record<string, { message: string; code?: string } | null>;
  rpcErrorsByUserId?: Record<string, { message: string; code?: string } | null>;
};

function createSupabaseHarness(options: SupabaseHarnessOptions = {}) {
  const events: string[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updateCalls: Array<{
    tableName: string;
    serviceId: string;
    payload: Record<string, unknown>;
  }> = [];

  const callRpc = vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    events.push(`rpc:${String(args.p_user_id)}:${String(args.p_amount)}`);
    return Promise.resolve({
      error:
        options.rpcErrorsByUserId?.[String(args.p_user_id)] ?? null,
    });
  });

  const client = {
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation((tableName: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((column: string, value: string) => {
            if (column !== "status") {
              throw new Error(`Unexpected select().eq(${column}, ${value})`);
            }
            return Promise.resolve({
              data: options.servicesByTable?.[tableName] ?? [],
              error: options.fetchErrorsByTable?.[tableName] ?? null,
            });
          }),
        }),
        update: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
          eq: vi.fn().mockImplementation((column: string, serviceId: string) => {
            if (column !== "service_id") {
              throw new Error(`Unexpected update().eq(${column}, ${serviceId})`);
            }

            events.push(`update:${tableName}:${serviceId}`);
            updateCalls.push({ tableName, serviceId, payload });

            return Promise.resolve({
              error: options.updateErrorsByServiceId?.[serviceId] ?? null,
            });
          }),
        })),
      })),
      rpc: callRpc,
    }),
    rpc: callRpc,
  };

  return {
    client,
    events,
    rpcCalls,
    updateCalls,
  };
}

async function loadWorker(options: SupabaseHarnessOptions = {}) {
  vi.resetModules();
  vi.stubEnv("SUPABASE_URL", "https://supabase.test.local");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

  const harness = createSupabaseHarness(options);
  const { createClient } = await import("@supabase/supabase-js");
  vi.mocked(createClient).mockReturnValue(harness.client as never);

  const worker = await import("../../../credit-system-cron/cron-worker.js");
  const cronModule = await import("node-cron");
  const scheduleMock = vi.mocked(cronModule.default.schedule);
  const scheduledCallback = scheduleMock.mock.calls[0]?.[1] as
    | (() => Promise<void>)
    | undefined;

  if (!scheduledCallback) {
    throw new Error("Expected cron.schedule callback to be registered");
  }

  return { worker, harness, scheduleMock, scheduledCallback };
}

const UUIDS = {
  serviceA: "11111111-1111-4111-8111-111111111111",
  serviceB: "22222222-2222-4222-8222-222222222222",
  serviceC: "33333333-3333-4333-8333-333333333333",
  serviceD: "44444444-4444-4444-8444-444444444444",
  userA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userC: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  userD: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

describe("credit-system-cron/cron-worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T12:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("TC-CRON-001: should bill all 4 active service tables in hourly cycle", async () => {
    const oneHourAgo = "2026-03-23T11:00:00.000Z";
    const { scheduledCallback, harness, scheduleMock } = await loadWorker({
      servicesByTable: {
        active_kubernetes: [
          {
            service_id: UUIDS.serviceA,
            user_id: UUIDS.userA,
            hourly_rate: 1,
            last_billed_at: oneHourAgo,
          },
        ],
        active_database: [
          {
            service_id: UUIDS.serviceB,
            user_id: UUIDS.userB,
            hourly_rate: 2,
            last_billed_at: oneHourAgo,
          },
        ],
        active_objectspace: [
          {
            service_id: UUIDS.serviceC,
            user_id: UUIDS.userC,
            hourly_rate: 3,
            last_billed_at: oneHourAgo,
          },
        ],
        active_spectrum: [
          {
            service_id: UUIDS.serviceD,
            user_id: UUIDS.userD,
            hourly_rate: 4,
            last_billed_at: oneHourAgo,
          },
        ],
      },
    });

    expect(scheduleMock).toHaveBeenCalledWith("0 * * * *", expect.any(Function));

    await scheduledCallback();

    expect(harness.rpcCalls).toHaveLength(4);
    expect(
      harness.rpcCalls.map((entry) => Number(entry.args.p_amount))
    ).toEqual(expect.arrayContaining([1, 2, 3, 4]));
  });

  it("TC-CRON-002: should calculate prorated charges for partial hour usage", async () => {
    const { worker, harness } = await loadWorker();

    await worker.billSingleService("active_kubernetes", {
      service_id: UUIDS.serviceA,
      user_id: UUIDS.userA,
      hourly_rate: 4,
      last_billed_at: "2026-03-23T11:30:00.000Z",
    });

    expect(harness.rpcCalls).toHaveLength(1);
    expect(Number(harness.rpcCalls[0].args.p_amount)).toBeCloseTo(2, 4);
  });

  it("TC-CRON-003: should enforce security caps on hours, rate, and cycle cost", async () => {
    const { worker, harness } = await loadWorker();

    await worker.billSingleService("active_database", {
      service_id: UUIDS.serviceB,
      user_id: UUIDS.userB,
      hourly_rate: 2000,
      last_billed_at: "2026-03-21T12:00:00.000Z",
    });

    expect(harness.rpcCalls).toHaveLength(1);
    expect(Number(harness.rpcCalls[0].args.p_amount)).toBe(5000);
  });

  it("TC-CRON-004: should skip invalid records and continue processing valid services", async () => {
    const { worker, harness } = await loadWorker({
      servicesByTable: {
        active_objectspace: [
          {
            service_id: "not-a-uuid",
            user_id: UUIDS.userC,
            hourly_rate: 10,
            last_billed_at: "2026-03-23T11:00:00.000Z",
          },
          {
            service_id: UUIDS.serviceC,
            user_id: UUIDS.userC,
            hourly_rate: 10,
            last_billed_at: "2026-03-23T11:00:00.000Z",
          },
        ],
      },
    });

    await worker.processServiceTable("active_objectspace");

    expect(harness.rpcCalls).toHaveLength(1);
    expect(harness.rpcCalls[0].args.p_user_id).toBe(UUIDS.userC);
  });

  it("TC-CRON-005: should update last_billed_at before deducting credits", async () => {
    const { worker, harness } = await loadWorker();

    await worker.billSingleService("active_spectrum", {
      service_id: UUIDS.serviceD,
      user_id: UUIDS.userD,
      hourly_rate: 1,
      last_billed_at: "2026-03-23T11:00:00.000Z",
    });

    const updateIndex = harness.events.findIndex((event) =>
      event.startsWith(`update:active_spectrum:${UUIDS.serviceD}`)
    );
    const rpcIndex = harness.events.findIndex((event) =>
      event.startsWith(`rpc:${UUIDS.userD}:`)
    );

    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(rpcIndex).toBeGreaterThan(updateIndex);
  });

  it("TC-CRON-006: should reject invalid table names (SQL injection prevention)", async () => {
    const { worker, harness } = await loadWorker();

    await worker.billSingleService("active_kubernetes; DROP TABLE billing.user_credits; --", {
      service_id: UUIDS.serviceA,
      user_id: UUIDS.userA,
      hourly_rate: 1,
      last_billed_at: "2026-03-23T11:00:00.000Z",
    });

    expect(harness.updateCalls).toHaveLength(0);
    expect(harness.rpcCalls).toHaveLength(0);
  });

  it("TC-CRON-007: should round cost to 4 decimal places for billing precision", async () => {
    const { worker, harness } = await loadWorker();

    await worker.billSingleService("active_database", {
      service_id: UUIDS.serviceB,
      user_id: UUIDS.userB,
      hourly_rate: 0.1,
      last_billed_at: "2026-03-23T11:40:00.000Z",
    });

    expect(harness.rpcCalls).toHaveLength(1);
    expect(Number(harness.rpcCalls[0].args.p_amount)).toBeCloseTo(0.0333, 4);
  });
});
