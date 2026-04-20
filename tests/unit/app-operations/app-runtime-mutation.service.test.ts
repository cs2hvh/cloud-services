import { beforeEach, describe, expect, it, vi } from "vitest";

const queriesMocks = vi.hoisted(() => ({
  updateAppMock: vi.fn(),
}));

vi.mock("@/lib/supabase/queries", () => ({
  Platform_Apps: {
    update: queriesMocks.updateAppMock,
  },
}));

describe("AppRuntimeMutationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queriesMocks.updateAppMock.mockResolvedValue({ success: true });
  });

  it("preserves the previous failure reason when rollback startup fails on a failed app", async () => {
    const { AppRuntimeMutationService } = await import(
      "@/lib/app-operations/application/app-runtime-mutation.service"
    );
    const deployments = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      createIdempotent: vi.fn().mockResolvedValue({
        reused: false,
        record: {
          id: "op-1",
          app_id: "app-1",
          build_number: null,
          commit_sha: null,
          image_tag: "hav0ky/app:1",
          image_digest: "sha256:111",
          status: "building" as const,
          trigger: "rollback" as const,
          failure_reason: null,
          rollback_target_build_number: 1,
          idempotency_key: null,
          operation_details: {
            schema_version: 1,
            type: "rollback",
            trigger_origin: "manual",
            steps: [],
          },
          created_at: new Date().toISOString(),
        },
      }),
      updateById: vi.fn().mockImplementation(async ({ operationId, status, failureReason, operationDetails }) => ({
        id: operationId,
        app_id: "app-1",
        build_number: null,
        commit_sha: null,
        image_tag: "hav0ky/app:1",
        image_digest: "sha256:111",
        status: status ?? "building",
        trigger: "rollback" as const,
        failure_reason: failureReason ?? null,
        rollback_target_build_number: 1,
        idempotency_key: null,
        operation_details: operationDetails ?? null,
        created_at: new Date().toISOString(),
      })),
    };
    const locks = {
      acquireAppMutationLock: vi.fn().mockResolvedValue({ id: "lock-1" }),
      attachOperationToLock: vi.fn().mockResolvedValue(undefined),
      releaseAppMutationLock: vi.fn().mockResolvedValue(undefined),
    };
    const registry = {
      verifyImageExists: vi.fn().mockResolvedValue({ exists: true }),
    };
    const logger = {
      child: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
      error: vi.fn(),
    };

    const service = new AppRuntimeMutationService(
      deployments as never,
      {} as never,
      locks as never,
      registry as never,
      logger as never
    );

    await expect(
      service.rollback({
        appId: "app-1",
        appName: "my-app",
        appStatus: "failed",
        appFailureReason: "Original deployment crashed",
        rollbackTargetBuildNumber: 1,
        targetDeploymentId: "deploy-1",
        imageRef: "hav0ky/app:1@sha256:111",
        executor: async () => {
          throw new Error("Patch failed");
        },
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_FAILED",
      message: "Patch failed",
      statusCode: 500,
    });

    expect(queriesMocks.updateAppMock).toHaveBeenNthCalledWith(1, "app-1", {
      status: "building",
      last_failure_reason: null,
    });
    expect(queriesMocks.updateAppMock).toHaveBeenNthCalledWith(2, "app-1", {
      status: "failed",
      last_failure_reason: "Original deployment crashed",
    });
  });
});
