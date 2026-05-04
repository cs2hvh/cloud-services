import { describe, expect, it } from "vitest";
import {
  getAppHistoryType,
  getAppOperationLabel,
  isReleaseHistoryEntry,
  resolveBuildBackedOperationState,
} from "@/lib/app-operations/core/presentation";

describe("app operation presentation helpers", () => {
  it("treats deploy and redeploy records as release history", () => {
    expect(
      isReleaseHistoryEntry({
        trigger: "manual",
        buildNumber: null,
        operationDetails: { type: "deploy" },
      })
    ).toBe(true);

    expect(
      isReleaseHistoryEntry({
        trigger: "webhook",
        buildNumber: 12,
        operationDetails: { type: "redeploy" },
      })
    ).toBe(true);
  });

  it("treats resize, rollback, and env updates as operation history", () => {
    expect(
      getAppHistoryType({
        trigger: "resize",
        buildNumber: 14,
        operationDetails: { type: "resize" },
      })
    ).toBe("operation");

    expect(
      getAppHistoryType({
        trigger: "rollback",
        buildNumber: null,
        operationDetails: { type: "rollback" },
      })
    ).toBe("operation");

    expect(
      getAppHistoryType({
        trigger: "manual",
        buildNumber: null,
        operationDetails: { type: "env_update" },
      })
    ).toBe("operation");
  });

  it("formats shared operation labels consistently", () => {
    expect(
      getAppOperationLabel({
        buildNumber: null,
        trigger: "rollback",
        rollbackTargetBuildNumber: 7,
        operationDetails: { type: "rollback" },
      })
    ).toBe("Rolled back to Build #7");

    expect(
      getAppOperationLabel({
        buildNumber: 22,
        trigger: "resize",
        operationDetails: {
          type: "resize",
          source: { size: "small" },
          target: { size: "medium" },
        },
      })
    ).toBe("Resize from small to medium");

    expect(
      getAppOperationLabel({
        buildNumber: null,
        trigger: "manual",
        operationDetails: { type: "env_update" },
      })
    ).toBe("Environment Update");
  });

  it("classifies reused build-backed operations without a Jenkins build number", () => {
    expect(
      resolveBuildBackedOperationState({
        actionLabel: "Redeploy",
        result: {
          buildNumber: null,
          reused: true,
          operation: {
            id: "op-1",
            app_id: "app-1",
            build_number: null,
            commit_sha: null,
            image_tag: null,
            image_digest: null,
            status: "building",
            trigger: "manual",
            failure_reason: null,
            rollback_target_build_number: null,
            idempotency_key: "same-key",
            operation_details: {
              schema_version: 1,
              type: "redeploy",
              trigger_origin: "manual",
              steps: [],
            },
            created_at: new Date().toISOString(),
          },
        },
      })
    ).toMatchObject({
      kind: "pending",
      code: "APP_OPERATION_IN_PROGRESS",
    });

    expect(
      resolveBuildBackedOperationState({
        actionLabel: "Resize",
        result: {
          buildNumber: null,
          reused: true,
          operation: {
            id: "op-2",
            app_id: "app-1",
            build_number: null,
            commit_sha: null,
            image_tag: null,
            image_digest: null,
            status: "failed",
            trigger: "resize",
            failure_reason: "Runtime secret sync failed",
            rollback_target_build_number: null,
            idempotency_key: "same-key",
            operation_details: {
              schema_version: 1,
              type: "resize",
              trigger_origin: "manual",
              steps: [],
              error: {
                code: "RESIZE_TRIGGER_FAILED",
                message: "Runtime secret sync failed",
                retryable: false,
              },
            },
            created_at: new Date().toISOString(),
          },
        },
      })
    ).toMatchObject({
      kind: "failed",
      code: "RESIZE_TRIGGER_FAILED",
      message: "Runtime secret sync failed",
    });
  });
});
