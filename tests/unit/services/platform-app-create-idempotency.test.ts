import { beforeEach, describe, expect, it, vi } from "vitest";

const idempotencyMocks = vi.hoisted(() => ({
  checkIdempotencyMock: vi.fn(),
  reserveMock: vi.fn(),
  completeMock: vi.fn(),
  abortMock: vi.fn(),
}));

vi.mock("@/lib/idempotency", () => ({
  checkIdempotency: idempotencyMocks.checkIdempotencyMock,
}));

describe("PlatformAppCreateIdempotencyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyMocks.reserveMock.mockResolvedValue(true);
    idempotencyMocks.completeMock.mockResolvedValue(undefined);
    idempotencyMocks.abortMock.mockResolvedValue(undefined);
    idempotencyMocks.checkIdempotencyMock.mockResolvedValue({
      status: "new",
      reserve: idempotencyMocks.reserveMock,
      complete: idempotencyMocks.completeMock,
      abort: idempotencyMocks.abortMock,
    });
  });

  it("does not persist failed create results for the same idempotency key", async () => {
    const { PlatformAppCreateIdempotencyService } = await import(
      "@/lib/services/platform-app-create-idempotency"
    );

    const service = new PlatformAppCreateIdempotencyService();
    const operation = await service.begin({
      userId: "user-1",
      idempotencyKey: "create-1",
      shouldPersistResult: (result: { success: boolean }) => result.success,
      execute: async () => ({
        success: false,
        error: "Deployment failed",
      }),
    });

    expect(operation.kind).toBe("new");
    if (operation.kind !== "new") {
      throw new Error("Expected new operation");
    }

    const result = await operation.execute();

    expect(result).toEqual({
      success: false,
      error: "Deployment failed",
    });
    expect(idempotencyMocks.completeMock).not.toHaveBeenCalled();
    expect(idempotencyMocks.abortMock).toHaveBeenCalledTimes(1);
  });

  it("persists successful create results", async () => {
    const { PlatformAppCreateIdempotencyService } = await import(
      "@/lib/services/platform-app-create-idempotency"
    );

    const service = new PlatformAppCreateIdempotencyService();
    const operation = await service.begin({
      userId: "user-1",
      idempotencyKey: "create-1",
      shouldPersistResult: (result: { success: boolean }) => result.success,
      execute: async () => ({
        success: true,
        appId: "app-1",
      }),
    });

    expect(operation.kind).toBe("new");
    if (operation.kind !== "new") {
      throw new Error("Expected new operation");
    }

    const result = await operation.execute();

    expect(result).toEqual({
      success: true,
      appId: "app-1",
    });
    expect(idempotencyMocks.completeMock).toHaveBeenCalledWith(result);
    expect(idempotencyMocks.abortMock).not.toHaveBeenCalled();
  });
});
