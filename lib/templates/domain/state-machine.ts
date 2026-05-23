export const TEMPLATE_VISIBILITIES = ['draft', 'unlisted', 'published', 'archived'] as const;
export const TEMPLATE_VERSION_STATUSES = ['draft', 'testing', 'tested', 'published', 'deprecated', 'rejected'] as const;
export const TEMPLATE_VERSION_LIFECYCLE_STATUSES = TEMPLATE_VERSION_STATUSES;
export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export const TEMPLATE_TEST_STATUSES = ['not_run', 'running', 'passed', 'failed'] as const;
export const TEMPLATE_REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export const PROJECT_STATUSES = [
  'creating',
  'deploying',
  'ready',
  'degraded',
  'failed',
  'deleting',
  'deleted',
] as const;

export const SERVICE_STATUSES = [
  'pending',
  'building',
  'deploying',
  'starting',
  'healthy',
  'degraded',
  'failed',
  'deleted',
] as const;

export const OPERATION_TYPES = ['create', 'update', 'delete', 'restart', 'rollback', 'retry'] as const;
export const PLATFORM_OPERATION_TYPES = [
  'create_project',
  'create_service',
  'update_service',
  'update_template',
  'delete_project',
  'delete_service',
  'connect_service',
  'disconnect_service',
  'restart',
  'redeploy',
  'rollback',
  'retry',
] as const;
export const OPERATION_STATUSES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
  'rolled_back',
] as const;

export const EVENT_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const EVENT_STATUSES = ['pending', 'running', 'success', 'failed', 'skipped'] as const;

export type TemplateVisibility = typeof TEMPLATE_VISIBILITIES[number];
export type TemplateVersionStatus = typeof TEMPLATE_VERSION_STATUSES[number];
export type TemplateVersionLifecycleStatus = typeof TEMPLATE_VERSION_LIFECYCLE_STATUSES[number];
export type VerificationStatus = typeof VERIFICATION_STATUSES[number];
export type TemplateTestStatus = typeof TEMPLATE_TEST_STATUSES[number];
export type TemplateReviewStatus = typeof TEMPLATE_REVIEW_STATUSES[number];
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type DeploymentStatus = ProjectStatus;
export type ServiceStatus = typeof SERVICE_STATUSES[number];
export type OperationType = typeof OPERATION_TYPES[number];
export type PlatformOperationType = typeof PLATFORM_OPERATION_TYPES[number];
export type OperationStatus = typeof OPERATION_STATUSES[number];
export type EventLevel = typeof EVENT_LEVELS[number];
export type EventStatus = typeof EVENT_STATUSES[number];

export function canTransitionOperation(from: OperationStatus, to: OperationStatus): boolean {
  const allowed: Record<OperationStatus, OperationStatus[]> = {
    queued: ['running', 'cancelled'],
    running: ['waiting', 'succeeded', 'failed', 'cancelled', 'rolled_back'],
    waiting: ['running', 'failed', 'cancelled'],
    succeeded: [],
    failed: ['queued', 'rolled_back'],
    cancelled: [],
    rolled_back: [],
  };
  return allowed[from].includes(to);
}

export function canTransitionTemplateVersion(from: TemplateVersionLifecycleStatus, to: TemplateVersionLifecycleStatus): boolean {
  const allowed: Record<TemplateVersionLifecycleStatus, TemplateVersionLifecycleStatus[]> = {
    draft: ['testing', 'tested', 'rejected'],
    testing: ['tested', 'draft', 'rejected'],
    tested: ['published', 'draft', 'rejected'],
    published: ['deprecated'],
    deprecated: [],
    rejected: ['draft'],
  };
  return allowed[from].includes(to);
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  const allowed: Record<ProjectStatus, ProjectStatus[]> = {
    creating: ['deploying', 'failed', 'deleting'],
    deploying: ['ready', 'degraded', 'failed', 'deleting'],
    // ready → deploying: adding a new service to an existing project
    ready: ['deploying', 'degraded', 'deleting'],
    degraded: ['ready', 'deploying', 'failed', 'deleting'],
    failed: ['deploying', 'deleting'],
    deleting: ['deleted', 'failed'],
    deleted: [],
  };
  return allowed[from].includes(to);
}

export const DEPLOYMENT_STATUSES = PROJECT_STATUSES;
export const canTransitionDeployment = canTransitionProject;
