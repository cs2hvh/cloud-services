/**
 * useRealtimeDeployments - Real-time deployment updates hook
 * 
 * Thin wrapper around useRealtimeTable for platform_app_deployments
 * Transforms database status values to UI-friendly format
 * 
 * HOW THIS WORKS:
 * 1. Uses generic useRealtimeTable hook under the hood
 * 2. Provides deployment-specific type safety
 * 3. Transforms database 'success'/'failed' -> UI 'SUCCESS'/'FAILURE'
 * 4. All connection management is handled by generic hook
 * 
 * Prerequisites:
 * - Supabase Dashboard → Database → Replication → platform_app_deployments → Enable
 * - RLS policy: Users can SELECT deployments for their apps
 * 
 * @example
 * // Simple usage
 * const { deployments, loading, connectionStatus } = useRealtimeDeployments({ appId: 'app-123' });
 * 
 * @example
 * // With options
 * const result = useRealtimeDeployments({ 
 *   appId: 'app-123', 
 *   limit: 50,
 *   enabled: isTabOpen 
 * });
 */

import { useRealtimeTable } from './use-realtime-table';

// Database schema (what Supabase returns)
interface DeploymentRecord extends Record<string, unknown> {
  id: string;
  app_id: string;
  build_number: number | null;
  commit_sha: string | null;
  image_tag: string | null;
  image_digest: string | null;
  status: 'success' | 'failed' | 'building'; // Database values
  trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
  failure_reason: string | null;
  created_at: string;
}

// UI-friendly format (what we expose to components)
interface Deployment {
  id: string;
  app_id: string;
  build_number: number;
  commit_sha: string | null;
  image_tag: string | null;
  image_digest: string | null;
  status: 'SUCCESS' | 'FAILURE' | 'BUILDING'; // UI values
  trigger: string;
  failure_reason: string | null;
  created_at: string;
  // Convenience aliases
  started_at: string;
}

interface UseRealtimeDeploymentsOptions {
  appId: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Transform database status to UI format
 */
function transformDeployment(record: DeploymentRecord): Deployment {
  return {
    id: record.id,
    app_id: record.app_id,
    build_number: record.build_number ?? 0,
    commit_sha: record.commit_sha,
    image_tag: record.image_tag,
    image_digest: record.image_digest,
    status: record.status === 'success' ? 'SUCCESS' : record.status === 'building' ? 'BUILDING' : 'FAILURE',
    trigger: record.trigger,
    failure_reason: record.failure_reason,
    created_at: record.created_at,
    started_at: record.created_at, // Alias for convenience
  };
}

/**
 * Real-time deployments hook
 * 
 * This is now a thin wrapper (~10 lines) instead of 200+ lines of connection logic
 * All complexity lives in useRealtimeTable
 */
export function useRealtimeDeployments({
  appId,
  limit = 20,
  enabled = true,
}: UseRealtimeDeploymentsOptions) {
  const {
    data: deployments,
    loading,
    error,
    connectionStatus,
    refetch,
  } = useRealtimeTable<DeploymentRecord, Deployment>({
    table: 'platform_app_deployments',
    filter: `app_id=eq.${appId}`,
    limit,
    enabled: enabled && !!appId,
    orderBy: 'created_at',
    orderDirection: 'desc',
    transform: transformDeployment,
  });

  return {
    // Filter out records where build_number was null in the DB;
    // they coalesce to 0 in transformDeployment and are not useful in the UI.
    deployments: deployments.filter((d) => d.build_number > 0),
    loading,
    error,
    connectionStatus,
    refetch,
  };
}
