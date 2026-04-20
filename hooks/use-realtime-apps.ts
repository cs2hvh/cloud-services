/**
 * useRealtimeApps - Real-time apps list updates
 * 
 * Subscribes to platform_apps table for all user's apps
 * Updates list when apps are created, status changes, or apps are deleted
 * 
 * Prerequisites:
 * - Supabase Dashboard → Database → Publications → platform_apps → Enable
 * - RLS policy: Users can SELECT their own apps
 * 
 * @example
 * const { apps, loading, connectionStatus } = useRealtimeApps({ 
 *   userId: 'user-123',
 *   limit: 100 
 * });
 */

import { useRealtimeTable } from './use-realtime-table';

// Database schema (what Supabase returns)
interface AppRecord extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  project_id: string | null;
  framework: string | null;
  branch: string | null;
  git_provider: string | null;
  auto_deploy: boolean | null;
  deploy_branch: string | null;
  build_command: string | null;
  output_directory: string | null;
  size: string | null;
  last_failure_reason: string | null;
}

// UI-friendly format (matches existing App type)
export interface App {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  updated_at?: string;
  project_id?: string;
  framework?: string;
  branch?: string;
  git_provider?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  build_command?: string;
  output_directory?: string;
  size?: string;
  last_failure_reason?: string | null;
  can_rollback?: boolean;
  serving_build_number?: number | null;
  last_operation_build_number?: number | null;
  last_operation_trigger?: string | null;
  rollback_target_build_number?: number | null;
  rollback_target_commit_sha?: string | null;
}

interface UseRealtimeAppsOptions {
  userId: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Transform database record to UI format
 */
function transformApp(record: AppRecord): App {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    repository_url: record.repository_url,
    port: record.port,
    status: record.status,
    deployment_url: record.deployment_url || undefined,
    created_at: record.created_at,
    updated_at: record.updated_at,
    project_id: record.project_id || undefined,
    framework: record.framework || undefined,
    branch: record.branch || undefined,
    git_provider: record.git_provider || undefined,
    auto_deploy: record.auto_deploy || undefined,
    deploy_branch: record.deploy_branch || undefined,
    build_command: record.build_command || undefined,
    output_directory: record.output_directory || undefined,
    size: record.size || undefined,
    last_failure_reason: record.last_failure_reason,
    can_rollback: false, // Can't determine from real-time, set to false
    serving_build_number: null,
    last_operation_build_number: null,
    last_operation_trigger: null,
    rollback_target_build_number: null,
    rollback_target_commit_sha: null,
  };
}

/**
 * Real-time apps list hook
 * 
 * Subscribes to all apps for a user and updates list in real-time
 */
export function useRealtimeApps({
  userId,
  limit = 100,
  enabled = true,
}: UseRealtimeAppsOptions) {
  const {
    data: apps,
    loading,
    error,
    connectionStatus,
    refetch,
  } = useRealtimeTable<AppRecord, App>({
    table: 'platform_apps',
    filter: `user_id=eq.${userId}`,
    limit,
    enabled: enabled && !!userId,
    orderBy: 'created_at',
    orderDirection: 'desc',
    transform: transformApp,
  });

  return {
    apps,
    loading,
    error,
    connectionStatus,
    refetch,
  };
}
