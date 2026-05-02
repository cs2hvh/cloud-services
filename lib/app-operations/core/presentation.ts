import { parseOperationDetails } from "@/lib/app-operations/core/operation-details";
import type {
  AppOperationDetails,
  AppOperationResult,
} from "@/lib/app-operations/core/types";
import { isReleaseBuildTrigger } from "@/lib/app-operations/core/release-history";

type PartialOperationDetails =
  | {
      type?: AppOperationDetails["type"] | string;
      source?: AppOperationDetails["source"];
      target?: AppOperationDetails["target"];
    }
  | null
  | undefined;

export type BuildBackedOperationState =
  | {
      kind: "ready";
      buildNumber: number;
      reused: boolean;
    }
  | {
      kind: "pending";
      code: "APP_OPERATION_IN_PROGRESS";
      message: string;
      reused: boolean;
    }
  | {
      kind: "failed";
      code: string;
      message: string;
      reused: boolean;
      retryable: boolean;
    }
  | {
      kind: "invalid";
      code: "BUILD_NUMBER_UNAVAILABLE";
      message: string;
      reused: boolean;
    };

function getOperationType(params: {
  trigger?: string | null;
  operationDetails?: PartialOperationDetails;
}) {
  return params.operationDetails?.type ?? params.trigger ?? null;
}

export function isReleaseHistoryEntry(params: {
  trigger?: string | null;
  buildNumber?: number | null;
  operationDetails?: PartialOperationDetails;
}): boolean {
  const operationType = getOperationType(params);

  if (
    operationType === "rollback" ||
    operationType === "resize" ||
    operationType === "env_update" ||
    operationType === "domain_add" ||
    operationType === "domain_remove"
  ) {
    return false;
  }

  if (operationType === "deploy" || operationType === "redeploy") {
    return true;
  }

  return isReleaseBuildTrigger(params.trigger) && params.buildNumber != null;
}

export function getAppHistoryType(params: {
  trigger?: string | null;
  buildNumber?: number | null;
  operationDetails?: PartialOperationDetails;
}): "release" | "operation" {
  return isReleaseHistoryEntry(params) ? "release" : "operation";
}

export function getAppOperationLabel(params: {
  buildNumber: number | null;
  trigger?: string | null;
  rollbackTargetBuildNumber?: number | null;
  operationDetails?: PartialOperationDetails;
}) {
  const operationType = getOperationType(params);

  if (operationType === "rollback") {
    return params.rollbackTargetBuildNumber != null
      ? `Rolled back to Build #${params.rollbackTargetBuildNumber}`
      : "Rollback";
  }

  if (operationType === "resize") {
    const from = params.operationDetails?.source?.size;
    const to = params.operationDetails?.target?.size;
    if (from || to) {
      return `Resize from ${from ?? "?"} to ${to ?? "?"}`;
    }
    return params.buildNumber != null ? `Resize #${params.buildNumber}` : "Resize";
  }

  if (operationType === "env_update") {
    return "Environment Update";
  }

  if (operationType === "domain_add") {
    return "Domain add";
  }

  if (operationType === "domain_remove") {
    return "Domain remove";
  }

  if (params.buildNumber == null) {
    return operationType === "redeploy" ? "Redeploy" : "Build";
  }

  return `Build #${params.buildNumber}`;
}

export function resolveBuildBackedOperationState(params: {
  result: Pick<AppOperationResult, "operation" | "buildNumber" | "reused">;
  actionLabel: string;
}): BuildBackedOperationState {
  if (typeof params.result.buildNumber === "number" && Number.isFinite(params.result.buildNumber)) {
    return {
      kind: "ready",
      buildNumber: params.result.buildNumber,
      reused: params.result.reused,
    };
  }

  const details = parseOperationDetails(params.result.operation.operation_details, {
    trigger: params.result.operation.trigger,
  });
  const failureMessage =
    details.error?.message ??
    params.result.operation.failure_reason ??
    `${params.actionLabel} could not be completed for this request.`;

  if (params.result.operation.status === "building") {
    return {
      kind: "pending",
      code: "APP_OPERATION_IN_PROGRESS",
      message: `${params.actionLabel} is already in progress. Jenkins build number is not available yet.`,
      reused: params.result.reused,
    };
  }

  if (params.result.operation.status === "failed") {
    return {
      kind: "failed",
      code: details.error?.code ?? "APP_OPERATION_FAILED",
      message: failureMessage,
      reused: params.result.reused,
      retryable: details.error?.retryable ?? false,
    };
  }

  return {
    kind: "invalid",
    code: "BUILD_NUMBER_UNAVAILABLE",
    message: `${params.actionLabel} completed without a Jenkins build number.`,
    reused: params.result.reused,
  };
}
