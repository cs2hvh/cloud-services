export interface App {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  project_id?: string;
  size?: string;
  can_rollback?: boolean;
  serving_build_number?: number | null;
  last_operation_build_number?: number | null;
  last_operation_trigger?: string | null;
  rollback_target_build_number?: number | null;
  rollback_target_commit_sha?: string | null;
}

export interface DeploymentPresentationFields {
  can_rollback?: boolean;
  serving_build_number?: number | null;
  last_operation_build_number?: number | null;
  last_operation_trigger?: string | null;
  rollback_target_build_number?: number | null;
  rollback_target_commit_sha?: string | null;
}

const DEPLOYMENT_PRESENTATION_KEYS: (keyof DeploymentPresentationFields)[] = [
  'can_rollback',
  'serving_build_number',
  'last_operation_build_number',
  'last_operation_trigger',
  'rollback_target_build_number',
  'rollback_target_commit_sha',
];

// Preserve previously fetched deployment metadata only when the new payload
// omits a field entirely. Explicit null from the API means "clear stale value".
export function mergeDeploymentPresentation<T extends DeploymentPresentationFields>(
  current: T,
  next?: DeploymentPresentationFields | null,
): T {
  if (!next) return current;

  const merged = { ...current };
  for (const key of DEPLOYMENT_PRESENTATION_KEYS) {
    if (next[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = next[key];
    }
  }
  return merged;
}

export interface BuildInfo {
  number: number;
  building: boolean;
  result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
  duration: number;
  timestamp: number;
  url: string;
}
