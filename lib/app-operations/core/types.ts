export type AppOperationType =
  | "deploy"
  | "redeploy"
  | "rollback"
  | "resize"
  | "env_update"
  | "domain_add"
  | "domain_remove";

export type AppTriggerOrigin = "manual" | "webhook" | "system";

export type AppExecutorType = "jenkins" | "k8s" | "hybrid";

export type AppMutationCategory = "app_mutation" | "domain_mutation" | "read_only";
export type ResourceMutationKind = "platform_app";

export type AppOperationStepStatus = "pending" | "running" | "success" | "failed";

export type AppOperationVerificationStatus =
  | "pending"
  | "healthy"
  | "degraded"
  | "failed";

export type AppDeploymentTrigger = "manual" | "webhook" | "rollback" | "resize";

export type AppDeploymentStatus = "building" | "success" | "failed";

export type AppOperationStep = {
  key: string;
  label: string;
  status: AppOperationStepStatus;
  started_at?: string;
  finished_at?: string;
  message?: string;
};

export type AppOperationDetails = {
  schema_version: 1;
  type: AppOperationType;
  trigger_origin: AppTriggerOrigin;
  source?: {
    deployment_id?: string;
    build_number?: number;
    size?: string;
  };
  target?: {
    deployment_id?: string;
    build_number?: number;
    image_ref?: string;
    size?: string;
  };
  executor?: {
    type: AppExecutorType;
    job_name?: string;
    run_number?: number;
    url?: string;
  };
  steps: AppOperationStep[];
  verification?: {
    status: AppOperationVerificationStatus;
    desired_replicas?: number;
    ready_replicas?: number;
    observed_image?: string;
    message?: string;
    checked_at?: string;
  };
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export type AppDeploymentRecord = {
  id: string;
  app_id: string;
  build_number: number | null;
  commit_sha: string | null;
  image_tag: string | null;
  image_digest: string | null;
  status: AppDeploymentStatus;
  trigger: AppDeploymentTrigger;
  failure_reason: string | null;
  rollback_target_build_number: number | null;
  idempotency_key: string | null;
  operation_details: AppOperationDetails | Record<string, unknown> | null;
  created_at: string;
};

export type AppOperationResult = {
  operation: AppDeploymentRecord;
  buildNumber: number | null;
  reused: boolean;
};

export type ResourceMutationLockRecord = {
  id: string;
  resource_kind: ResourceMutationKind;
  resource_id: string;
  category: AppMutationCategory;
  holder: string;
  operation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string;
};
