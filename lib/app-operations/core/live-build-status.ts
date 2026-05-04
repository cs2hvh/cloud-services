import type { BuildInfo } from "@/components/dashboard/apps/types";

type DeploymentStatus = "SUCCESS" | "FAILURE" | "BUILDING";

type DeploymentLike = {
  build_number: number | null;
  status: DeploymentStatus;
  failure_reason: string | null;
};

function resolveTerminalStatus(
  result: BuildInfo["result"]
): DeploymentStatus {
  return result === "SUCCESS" ? "SUCCESS" : "FAILURE";
}

function isTransientStartFailure(failureReason: string | null): boolean {
  if (!failureReason) return false;
  return (
    failureReason === "Build never started" ||
    failureReason.startsWith("Build timeout:")
  );
}

/**
 * Reconcile DB deployment status with the current Jenkins build state for the same build number.
 * This prevents temporary/stale DB statuses from flashing incorrect FAILURE in the UI.
 */
export function applyLiveBuildStatus<T extends DeploymentLike>(
  deployment: T,
  buildInfo: BuildInfo | null
): T {
  if (!buildInfo) return deployment;
  if (deployment.build_number == null) return deployment;
  if (deployment.build_number !== buildInfo.number) return deployment;

  // Jenkins confirms build is still running -> always show BUILDING.
  if (buildInfo.building) {
    if (deployment.status === "BUILDING" && deployment.failure_reason === null) {
      return deployment;
    }
    return {
      ...deployment,
      status: "BUILDING",
      failure_reason: null,
    };
  }

  // Jenkins done, DB still BUILDING -> move to terminal status.
  if (deployment.status === "BUILDING") {
    // Null result is an intermediate Jenkins state; keep BUILDING until terminal.
    if (buildInfo.result === null) return deployment;
    const terminal = resolveTerminalStatus(buildInfo.result);
    return {
      ...deployment,
      status: terminal,
      failure_reason: terminal === "SUCCESS" ? null : deployment.failure_reason,
    };
  }

  // DB marked FAILURE for queue-related transient reason, but Jenkins confirms SUCCESS.
  if (
    deployment.status === "FAILURE" &&
    buildInfo.result === "SUCCESS" &&
    isTransientStartFailure(deployment.failure_reason)
  ) {
    return {
      ...deployment,
      status: "SUCCESS",
      failure_reason: null,
    };
  }

  return deployment;
}

