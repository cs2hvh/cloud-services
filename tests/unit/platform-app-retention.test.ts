import { describe, expect, it } from "vitest";

import {
  clampDeploymentHistoryLimit,
  getBuildLogRetentionUntil,
  getPlatformAppRetentionPolicy,
} from "@/lib/platform-apps/retention";

describe("platform app retention policy", () => {
  it("uses the default visible deployment limit when no limit is requested", () => {
    const policy = getPlatformAppRetentionPolicy("pro");

    expect(clampDeploymentHistoryLimit(undefined, policy)).toBe(
      policy.deploymentHistory.defaultVisible
    );
  });

  it("clamps requested deployment history to the plan maximum", () => {
    const policy = getPlatformAppRetentionPolicy("pro");

    expect(clampDeploymentHistoryLimit(10_000, policy)).toBe(
      policy.deploymentHistory.maxLoadable
    );
  });

  it("keeps pinned logs indefinitely", () => {
    expect(
      getBuildLogRetentionUntil({
        status: "success",
        pinned: true,
        policy: getPlatformAppRetentionPolicy("pro"),
      })
    ).toBeNull();
  });
});
