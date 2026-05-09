import type {
  AppDeploymentTrigger,
  AppExecutorType,
  AppOperationDetails,
  AppOperationType,
  AppOperationVerificationStatus,
} from "@/lib/app-operations/core/types";

const now = () => new Date().toISOString();

function inferOperationTypeFromTrigger(trigger: AppDeploymentTrigger): AppOperationType {
  if (trigger === "rollback") return "rollback";
  if (trigger === "resize") return "resize";
  return "deploy";
}

function inferTriggerOrigin(trigger: AppDeploymentTrigger): AppOperationDetails["trigger_origin"] {
  if (trigger === "webhook") return "webhook";
  return "manual";
}

export function createOperationDetails(params: {
  type?: AppOperationType;
  trigger?: AppDeploymentTrigger;
  triggerOrigin?: AppOperationDetails["trigger_origin"];
  source?: AppOperationDetails["source"];
  target?: AppOperationDetails["target"];
  executor?: AppOperationDetails["executor"];
  steps?: AppOperationDetails["steps"];
  verification?: AppOperationDetails["verification"];
  warnings?: string[];
  error?: AppOperationDetails["error"];
}): AppOperationDetails {
  const inferredTrigger = params.trigger ?? "manual";
  return {
    schema_version: 1,
    type: params.type ?? inferOperationTypeFromTrigger(inferredTrigger),
    trigger_origin: params.triggerOrigin ?? inferTriggerOrigin(inferredTrigger),
    source: params.source,
    target: params.target,
    executor: params.executor,
    steps: params.steps ?? [],
    verification: params.verification,
    warnings: params.warnings,
    error: params.error,
  };
}

export function parseOperationDetails(
  value: unknown,
  fallback?: {
    type?: AppOperationType;
    trigger?: AppDeploymentTrigger;
  }
): AppOperationDetails {
  const base = createOperationDetails({
    type: fallback?.type,
    trigger: fallback?.trigger,
  });

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return base;
  }

  const raw = value as Partial<AppOperationDetails>;
  return {
    schema_version: 1,
    type: raw.type ?? base.type,
    trigger_origin: raw.trigger_origin ?? base.trigger_origin,
    source: raw.source,
    target: raw.target,
    executor: raw.executor,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    verification: raw.verification,
    warnings: Array.isArray(raw.warnings) ? raw.warnings : undefined,
    error: raw.error,
  };
}

export function upsertOperationStep(
  details: AppOperationDetails,
  step: {
    key: string;
    label: string;
    status: AppOperationDetails["steps"][number]["status"];
    message?: string;
  }
): AppOperationDetails {
  const existingIndex = details.steps.findIndex((entry) => entry.key === step.key);
  const nextStep = {
    key: step.key,
    label: step.label,
    status: step.status,
    message: step.message,
    started_at:
      step.status === "running"
        ? details.steps[existingIndex]?.started_at ?? now()
        : details.steps[existingIndex]?.started_at,
    finished_at:
      step.status === "success" || step.status === "failed" ? now() : undefined,
  };

  const steps = [...details.steps];
  if (existingIndex === -1) {
    steps.push(nextStep);
  } else {
    steps[existingIndex] = {
      ...steps[existingIndex],
      ...nextStep,
    };
  }

  return {
    ...details,
    steps,
  };
}

export function setOperationExecutor(
  details: AppOperationDetails,
  executor: {
    type: AppExecutorType;
    job_name?: string;
    run_number?: number;
    url?: string;
  }
): AppOperationDetails {
  return {
    ...details,
    executor: {
      ...(details.executor ?? {}),
      ...executor,
    },
  };
}

export function setOperationVerification(
  details: AppOperationDetails,
  verification: {
    status: AppOperationVerificationStatus;
    desired_replicas?: number;
    ready_replicas?: number;
    observed_image?: string;
    message?: string;
  }
): AppOperationDetails {
  return {
    ...details,
    verification: {
      ...verification,
      checked_at: now(),
    },
  };
}

export function setOperationError(
  details: AppOperationDetails,
  error: {
    code: string;
    message: string;
    retryable: boolean;
  }
): AppOperationDetails {
  return {
    ...details,
    error,
  };
}

export function appendOperationWarning(
  details: AppOperationDetails,
  warning: string
): AppOperationDetails {
  return {
    ...details,
    warnings: [...(details.warnings ?? []), warning],
  };
}
