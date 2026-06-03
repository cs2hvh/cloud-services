'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Plus,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Link2
} from 'lucide-react';
import { LinkedDatabaseCard } from './linked-database-card';
import { LinkDatabaseModal } from './link-database-modal-v2';
import { UnlinkConfirmationModal } from './unlink-confirmation-modal';
import { EditIntegrationModal } from './edit-integration-modal';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { fetchDatabasePlansAction } from '@/actions/fetch-database-plans';
import type { 
  LinkedDatabase, 
  AvailableDatabase, 
  LinkDatabaseResponse,
  UnlinkDatabaseResponse,
  EnvVarConfig,
  CreateDatabaseData,
  DatabasePlan,
} from './types';

// ─── Design tokens (match app-overview-tab) ─────────────────────────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface AppIntegrationsSectionProps {
  appId: string;
  appName: string;
  projectId: string;
}

/**
 * Main integrations section for app detail page
 * Displays linked databases and allows linking new ones
 */
export function AppIntegrationsSection({ appId, appName, projectId }: AppIntegrationsSectionProps) {
  const [linkedDatabases, setLinkedDatabases] = useState<LinkedDatabase[]>([]);
  const [availableDatabases, setAvailableDatabases] = useState<AvailableDatabase[]>([]);
  const [databasePlans, setDatabasePlans] = useState<DatabasePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkModalOpen, setUnlinkModalOpen] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedDatabase | null>(null);
  const [editTarget, setEditTarget] = useState<LinkedDatabase | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Fetch linked databases for this app
  const fetchLinkedDatabases = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/platform-apps/integrations/linked?app_id=${appId}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch integrations');
      }

      setLinkedDatabases(data.integrations || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching linked databases:', err);
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // Fetch available databases (user's databases)
  const fetchAvailableDatabases = useCallback(async (currentLinkedDbs: LinkedDatabase[] = []) => {
    if (!userId) return;
    
    setLoadingAvailable(true);
    try {
      const res = await fetch('/api/services/database/read_all_owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to fetch databases' }));
        throw new Error(errorData.error || 'Failed to fetch databases');
      }
      
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Filter out already linked databases
      const linkedIds = new Set(currentLinkedDbs.map(db => db.database_cluster_id));
      const available = (data.data || []).filter(
        (db: AvailableDatabase) => !linkedIds.has(db.cluster_id)
      );

      setAvailableDatabases(available);
    } catch (err) {
      console.error('Error fetching available databases:', err);
    } finally {
      setLoadingAvailable(false);
    }
  }, [userId]);

  // Fetch database plans for creating new databases
  const fetchDatabasePlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const result = await fetchDatabasePlansAction();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch plans');
      }

      const plans = result.plans || [];
      setDatabasePlans(plans);
    } catch (err) {
      console.error('Error fetching database plans:', err);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLinkedDatabases();
  }, [fetchLinkedDatabases]);

  // Fetch available and plans when modal opens
  useEffect(() => {
    if (linkModalOpen && userId) {
      fetchAvailableDatabases(linkedDatabases);
      fetchDatabasePlans();
    }
  }, [linkModalOpen, userId, fetchAvailableDatabases, fetchDatabasePlans, linkedDatabases]);

  // Handle link database with custom env configs
  const handleLink = async (
    databaseId: string, 
    envConfigs: EnvVarConfig[], 
    force: boolean
  ): Promise<LinkDatabaseResponse> => {
    try {
      // Build custom env var mapping from configs
      const envMapping = envConfigs.reduce((acc, config) => {
        if (config.customKey !== config.originalKey) {
          acc[config.originalKey] = config.customKey;
        }
        return acc;
      }, {} as Record<string, string>);

      const res = await fetch('/api/services/platform-apps/integrations/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          database_id: databaseId,
          env_mapping: envMapping,
          force,
        }),
      });

      const data = await res.json();
      return data;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  };

  // Handle create new database
  const handleCreateDatabase = async (data: CreateDatabaseData): Promise<{
    success: boolean;
    database_id?: string;
    connection?: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      uri: string;
    };
    error?: string;
  }> => {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'User not authenticated',
        };
      }

      // Use the plan's slug if available (matches main DB page behaviour),
      // otherwise derive from resources, or fall back to smallest tier
      const selectedPlan = databasePlans.find(p => p.id === data.plan_id);
      const slug = selectedPlan?.slug;
      const cpu = selectedPlan?.resources?.cpu;
      const ram = selectedPlan?.resources?.ram;
      const size = slug
        || ((cpu && cpu > 0 && ram && ram > 0)
          ? `db-s-${cpu}vcpu-${ram}gb`
          : 'db-s-1vcpu-1gb');

      const res = await fetch('/api/services/database/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          engine: data.engine,
          version: data.version,
          num_nodes: 1,
          size: size,
          region: data.region,
          project_id: data.project_id,
          plan_id: data.plan_id,
          owner_id: userId,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: result.error || 'Failed to create database',
        };
      }

      // Database created successfully
      // Note: Connection info may not be immediately available as DB is provisioning
      // Use the unencrypted 'connection' field returned on create (not the encrypted data.public_connection)
      const conn = result.connection || result?.data?.public_connection;
      
      // Refresh available databases list to include the newly created one
      fetchAvailableDatabases(linkedDatabases);
      
      return {
        success: true,
        database_id: result?.data?.cluster_id || result?.data?.id,
        connection: conn ? {
          host: conn.host,
          port: conn.port,
          user: conn.user,
          password: typeof conn.password === 'string' ? conn.password : '',
          database: conn.database || 'defaultdb',
          uri: conn.uri || '',
        } : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  };

  // Open unlink confirmation modal
  const handleUnlink = async (databaseId: string): Promise<void> => {
    const db = linkedDatabases.find(d => d.database_cluster_id === databaseId);
    if (db) {
      setUnlinkTarget(db);
      setUnlinkModalOpen(true);
    }
  };

  // Retry a failed integration — unlink failed record then reopen link modal
  const handleRetry = async (databaseId: string): Promise<void> => {
    // First, remove the failed record via unlink
    setUnlinkingId(databaseId);
    try {
      const res = await fetch('/api/services/platform-apps/integrations/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, database_id: databaseId }),
      });
      const data = await res.json();
      if (!data.success && data.code !== 'NOT_LINKED') {
        toast.error(data.error || 'Failed to clear failed integration');
        return;
      }
      await fetchLinkedDatabases();
      // Open the link modal so user can retry
      setLinkModalOpen(true);
      toast.info('Failed integration cleared — you can re-link now');
    } catch (error) {
      toast.error(error instanceof Error ? 'Network error while retrying' : 'Network error while retrying');
    } finally {
      setUnlinkingId(null);
    }
  };

  // Edit integration — open modal to rename env var keys
  const handleEdit = (databaseId: string): void => {
    const db = linkedDatabases.find(d => d.database_cluster_id === databaseId);
    if (db) {
      setEditTarget(db);
      setEditModalOpen(true);
    }
  };

  const handleEditSuccess = async () => {
    setEditModalOpen(false);
    setEditTarget(null);
    await fetchLinkedDatabases();
  };

  // Handle modal close
  const handleUnlinkModalClose = (open: boolean) => {
    setUnlinkModalOpen(open);
    if (!open) {
      setUnlinkTarget(null);
    }
  };

  // Confirm and execute unlink
  const confirmUnlink = async (): Promise<void> => {
    if (!unlinkTarget) return;

    const targetId = unlinkTarget.database_cluster_id;
    
    // Close modal immediately
    setUnlinkModalOpen(false);
    setUnlinkTarget(null);
    
    // Execute unlink in background
    setUnlinkingId(targetId);

    try {
      const res = await fetch('/api/services/platform-apps/integrations/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          database_id: targetId,
        }),
      });

      const data: UnlinkDatabaseResponse = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to unlink database');
      }

      // Refresh the list
      await fetchLinkedDatabases();
    } catch (err) {
      console.error('Error unlinking database:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to unlink database');
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <>
      <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
              <Link2 className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white truncate">Database Integrations</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLinkedDatabases}
              disabled={loading}
              className="shrink-0 text-white/25 transition-colors hover:text-white/70 disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setLinkModalOpen(true)}
              className={`${MONO} inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white`}
              style={{ background: 'linear-gradient(135deg,#0095FF,#0066B3)', boxShadow: '0 8px 20px rgba(0,149,255,0.20)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Link Database
            </button>
          </div>
        </header>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-[6px] border border-red-500/20 bg-red-500/[0.04] px-4 py-3.5 text-red-400/90">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-[13px]">{error}</p>
            </div>
          ) : linkedDatabases.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.08] bg-[#0d0e11]">
                <Database className="h-5 w-5 text-white/30" />
              </span>
              <h4 className="mb-1.5 text-[14px] font-semibold text-white">No Databases Linked</h4>
              <p className={`${MONO} mb-4 text-[11px] tracking-[0.04em] text-white/40`}>
                Connect a database to automatically inject connection credentials
              </p>
              <button
                onClick={() => setLinkModalOpen(true)}
                className={`${MONO} inline-flex items-center gap-1.5 rounded-[5px] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white`}
                style={{ background: 'linear-gradient(135deg,#0095FF,#0066B3)', boxShadow: '0 8px 20px rgba(0,149,255,0.20)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Link Your First Database
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {linkedDatabases.map((db) => (
                <LinkedDatabaseCard
                  key={db.integration_id}
                  database={db}
                  onUnlink={handleUnlink}
                  onEdit={handleEdit}
                  onRetry={handleRetry}
                  unlinking={unlinkingId === db.database_cluster_id}
                />
              ))}
            </div>
          )}

          {/* Info */}
          {linkedDatabases.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <p className={`${MONO} text-[10.5px] leading-relaxed tracking-[0.02em] text-white/40`}>
                Linked databases automatically inject connection environment variables into your app.
                Changes trigger a redeploy if the app is running.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Link Modal */}
      <LinkDatabaseModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        appId={appId}
        appName={appName}
        projectId={projectId}
        databases={availableDatabases}
        loadingDatabases={loadingAvailable}
        databasePlans={databasePlans}
        loadingPlans={loadingPlans}
        onLink={handleLink}
        onCreateDatabase={handleCreateDatabase}
        onSuccess={fetchLinkedDatabases}
      />

      {/* Edit Integration Modal */}
      <EditIntegrationModal
        open={editModalOpen}
        onOpenChange={(open: boolean) => { setEditModalOpen(open); if (!open) setEditTarget(null); }}
        appId={appId}
        integration={editTarget}
        onSuccess={handleEditSuccess}
      />

      {/* Unlink Confirmation Modal */}
      <UnlinkConfirmationModal
        open={unlinkModalOpen}
        onOpenChange={handleUnlinkModalClose}
        onConfirm={confirmUnlink}
        isUnlinking={unlinkingId === unlinkTarget?.database_cluster_id}
        resourceType="database"
        resourceName={unlinkTarget?.database_name || ''}
        injectedVars={unlinkTarget?.injected_env_keys || []}
      />
    </>
  );
}
