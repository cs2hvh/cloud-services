import { beforeEach, describe, expect, it, vi } from "vitest";

const queriesMocks = vi.hoisted(() => ({
  completeBuildMock: vi.fn(),
  updateAppMock: vi.fn(),
}));

vi.mock("@/lib/supabase/queries", () => ({
  Platform_App_Deployments: {
    complete_build: queriesMocks.completeBuildMock,
    set_active_for_app: vi.fn(),
  },
  Platform_Apps: {
    update: queriesMocks.updateAppMock,
  },
}));

describe("AppOperationFinalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queriesMocks.updateAppMock.mockResolvedValue({ success: true });
  });

  it("skips duplicate build finalization side effects when the build record is already terminal", async () => {
    const { AppOperationFinalizer } = await import(
      "@/lib/app-operations/application/app-operation-finalizer"
    );

    const existingRecord = {
      id: "deploy-1",
      app_id: "app-1",
      build_number: 42,
      commit_sha: "abc123",
      image_tag: "image:42",
      image_digest: "sha256:abc",
      status: "success" as const,
      trigger: "resize" as const,
      failure_reason: null,
      rollback_target_build_number: null,
      idempotency_key: null,
      operation_details: {
        schema_version: 1,
        type: "resize",
        trigger_origin: "manual",
        source: { size: "small" },
        target: { size: "medium" },
        steps: [],
      },
      created_at: new Date().toISOString(),
    };

    queriesMocks.completeBuildMock.mockResolvedValue({
      success: true,
      data: { id: "deploy-1" },
      updated: false,
      created: false,
    });

    const deployments = {
      findByBuildNumber: vi.fn().mockResolvedValue(existingRecord),
      findById: vi.fn().mockResolvedValue(existingRecord),
      updateById: vi.fn(),
    };
    const sideEffects = {
      applyBuildFinalizationSideEffects: vi.fn(),
    };
    const locks = {
      releaseAppMutationLockForOperation: vi.fn().mockResolvedValue(undefined),
    };
    const loggerChild = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = {
      child: vi.fn().mockReturnValue(loggerChild),
    };

    const finalizer = new AppOperationFinalizer(
      deployments as never,
      {} as never,
      locks as never,
      sideEffects as never,
      logger as never
    );

    const result = await finalizer.finalizeBuildOperation({
      appId: "app-1",
      appName: "my-app",
      buildNumber: 42,
      trigger: "resize",
      status: "success",
      imageTag: "image:42",
      imageDigest: "sha256:abc",
      allowedCurrentStatuses: ["building"],
      allowLegacyCreate: false,
    });

    expect(result).toEqual({
      record: existingRecord,
      legacyCreated: false,
    });
    expect(sideEffects.applyBuildFinalizationSideEffects).not.toHaveBeenCalled();
    expect(deployments.updateById).not.toHaveBeenCalled();
    expect(queriesMocks.updateAppMock).not.toHaveBeenCalled();
    expect(locks.releaseAppMutationLockForOperation).toHaveBeenCalledWith("deploy-1");
  });
});
