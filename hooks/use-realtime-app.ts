/**
 * useRealtimeApp - Real-time app metadata updates
 * 
 * Subscribes to changes on the platform_apps table for a specific app
 * Updates app status, configuration, and metadata in real-time
 * 
 * Prerequisites:
 * - Supabase Dashboard → Database → Replication → platform_apps → Enable
 * - RLS policy: Users can SELECT their own apps
 * 
 * @example
 * const { app, loading, connectionStatus } = useRealtimeApp({ appId: 'app-123' });
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

// UI-friendly format
interface App {
  id: string;
  name: string;
  slug: string;
  repository_url: string;
  port: number;
  status: string;
  deployment_url?: string;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  framework?: string;
  branch?: string;
  git_provider?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  build_command?: string;
  output_directory?: string;
  size?: string;
  last_failure_reason?: string | null;
}

interface UseRealtimeAppOptions {
  appId: string;
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
    project_id: record.project_id,
    framework: record.framework || undefined,
    branch: record.branch || undefined,
    git_provider: record.git_provider || undefined,
    auto_deploy: record.auto_deploy || undefined,
    deploy_branch: record.deploy_branch || undefined,
    build_command: record.build_command || undefined,
    output_directory: record.output_directory || undefined,
    size: record.size || undefined,
    last_failure_reason: record.last_failure_reason,
  };
}

/**
 * Real-time app updates hook
 * 
 * Subscribes to a single app record and updates when it changes
 */
export function useRealtimeApp({
  appId,
  enabled = true,
}: UseRealtimeAppOptions) {
  const {
    data: apps,
    loading,
    error,
    connectionStatus,
    refetch,
  } = useRealtimeTable<AppRecord, App>({
    table: 'platform_apps',
    filter: `id=eq.${appId}`,
    limit: 1,
    enabled: enabled && !!appId,
    orderBy: 'updated_at',
    orderDirection: 'desc',
    transform: transformApp,
  });

  return {
    app: apps[0] || null,
    loading,
    error,
    connectionStatus,
    refetch,
  };
}
