import { describe, expect, it } from "vitest";
import {
  findRollbackTarget,
  findServingRelease,
  isReleaseBuildTrigger,
} from "@/lib/app-operations/core/release-history";

describe("release-history helpers", () => {
  it("treats only manual and webhook builds as release builds", () => {
    expect(isReleaseBuildTrigger("manual")).toBe(true);
    expect(isReleaseBuildTrigger("webhook")).toBe(true);
    expect(isReleaseBuildTrigger("resize")).toBe(false);
    expect(isReleaseBuildTrigger("rollback")).toBe(false);
  });

  it("resolves the serving release from a rollback event using image identity", () => {
    const servingRelease = findServingRelease({
      currentDeployment: {
        id: "rollback-1",
        trigger: "rollback",
        image_tag: "registry/app:build-3",
        image_digest: "sha256:333",
      },
      successfulReleases: [
        {
          id: "release-3",
          trigger: "manual",
          build_number: 3,
          image_tag: "registry/app:build-3",
          image_digest: "sha256:333",
        },
        {
          id: "release-2",
          trigger: "webhook",
          build_number: 2,
          image_tag: "registry/app:build-2",
          image_digest: "sha256:222",
        },
      ],
    });

    expect(servingRelease?.id).toBe("release-3");
  });

  it("keeps the current release when the active release is outside the recent history window", () => {
    const servingRelease = findServingRelease({
      currentDeployment: {
        id: "release-3",
        trigger: "manual",
        build_number: 3,
        image_tag: "registry/app:build-3",
        image_digest: "sha256:333",
      },
      successfulReleases: [
        {
          id: "release-25",
          trigger: "manual",
          build_number: 25,
          image_tag: "registry/app:build-25",
          image_digest: "sha256:2525",
        },
        {
          id: "release-24",
          trigger: "webhook",
          build_number: 24,
          image_tag: "registry/app:build-24",
          image_digest: "sha256:2424",
        },
      ],
    });

    expect(servingRelease?.id).toBe("release-3");
  });

  it("selects the previous real release as rollback target", () => {
    const currentDeployment = {
      id: "rollback-1",
      trigger: "rollback",
      image_tag: "registry/app:build-3",
      image_digest: "sha256:333",
    };
    const servingRelease = {
      id: "release-3",
      trigger: "manual",
      build_number: 3,
      image_tag: "registry/app:build-3",
      image_digest: "sha256:333",
    };

    const rollbackTarget = findRollbackTarget({
      currentDeployment,
      servingRelease,
      successfulReleases: [
        servingRelease,
        {
          id: "release-2",
          trigger: "webhook",
          build_number: 2,
          image_tag: "registry/app:build-2",
          image_digest: "sha256:222",
        },
        {
          id: "release-1",
          trigger: "manual",
          build_number: 1,
          image_tag: "registry/app:build-1",
          image_digest: "sha256:111",
        },
      ],
    });

    expect(rollbackTarget?.id).toBe("release-2");
  });
});
