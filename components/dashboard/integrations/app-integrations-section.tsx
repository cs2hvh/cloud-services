'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { createClient } from '@/lib/supabase/client';
import type { 
  LinkedDatabase, 
  AvailableDatabase, 
  LinkDatabaseResponse,
  UnlinkDatabaseResponse,
  EnvVarConfig,
  CreateDatabaseData,
  DatabasePlan,
} from './types';

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
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
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
      const res = await fetch('/api/admin/products?type=database');
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to fetch plans' }));
        throw new Error(errorData.error || 'Failed to fetch plans');
      }
      
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // API returns { products: [...] }
      // Filter to only MySQL, PostgreSQL, MongoDB plans based on 'sub' field
      const validEngines = ['mysql', 'pg', 'mongodb'];
      const allPlans = data.products || data.data || [];
      const plans = allPlans.filter((plan: DatabasePlan) => {
        const sub = (plan.sub || '').toLowerCase();
        // Match exact engine type in 'sub' field
        return validEngines.includes(sub);
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkModalOpen, userId]);

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

      // Find the selected plan to get CPU/RAM for size calculation
      const selectedPlan = databasePlans.find(p => p.id === data.plan_id);
      const cpu = selectedPlan?.resources?.cpu || 1;
      const ram = selectedPlan?.resources?.ram || 1;
      const size = `db-s-${cpu}vcpu-${ram}gb`;

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
      const conn = result.connection || result.data?.public_connection;
      return {
        success: true,
        database_id: result.data?.cluster_id || result.data?.id,
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

  // Handle unlink database
  const handleUnlink = async (databaseId: string): Promise<void> => {
    if (!confirm('Are you sure you want to unlink this database? Environment variables will be removed.')) {
      return;
    }

    setUnlinkingId(databaseId);

    try {
      const res = await fetch('/api/services/platform-apps/integrations/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          database_id: databaseId,
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
      alert(err instanceof Error ? err.message : 'Failed to unlink database');
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <>
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-400" />
            Database Integrations
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchLinkedDatabases}
              disabled={loading}
              className="text-white/60 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => setLinkModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Link Database
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-white/50" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-400 py-4">
              <AlertTriangle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          ) : linkedDatabases.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white/70 mb-2">No Databases Linked</h3>
              <p className="text-sm text-white/50 mb-4">
                Connect a database to automatically inject connection credentials
              </p>
              <Button
                onClick={() => setLinkModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Link Your First Database
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {linkedDatabases.map((db) => (
                <LinkedDatabaseCard
                  key={db.integration_id}
                  database={db}
                  onUnlink={handleUnlink}
                  unlinking={unlinkingId === db.database_cluster_id}
                />
              ))}
            </div>
          )}

          {/* Info */}
          {linkedDatabases.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/40">
                💡 Linked databases automatically inject environment variables (DATABASE_URL, etc.) 
                into your app. Changes trigger a redeploy if the app is running.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Modal */}
      <LinkDatabaseModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
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
    </>
  );
}
