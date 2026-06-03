'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Archive,
} from 'lucide-react';
import { LinkedStorageCard } from './linked-storage-card';
import { LinkStorageModal } from './link-storage-modal';
import { UnlinkConfirmationModal } from './unlink-confirmation-modal';
import { EditStorageIntegrationModal } from './edit-storage-integration-modal';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { 
  LinkedBucket, 
  AvailableBucket, 
  LinkStorageResponse,
  EnvVarConfig,
} from './types';

// ─── Design tokens (match app-overview-tab) ─────────────────────────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface StorageIntegrationsSectionProps {
  appId: string;
  appName: string;
  projectId: string;
}

/**
 * Object Storage integrations section for app detail page
 * Displays linked buckets and allows linking new ones
 */
export function StorageIntegrationsSection({ appId, appName, projectId }: StorageIntegrationsSectionProps) {
  const [linkedBuckets, setLinkedBuckets] = useState<LinkedBucket[]>([]);
  const [availableBuckets, setAvailableBuckets] = useState<AvailableBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkModalOpen, setUnlinkModalOpen] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedBucket | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LinkedBucket | null>(null);
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

  // Fetch linked buckets for this app
  const fetchLinkedBuckets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/services/platform-apps/integrations/storage/linked?app_id=${appId}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch storage integrations');
      }

      setLinkedBuckets(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching linked buckets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load storage integrations');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // Fetch available buckets (user's buckets not already linked)
  const fetchAvailableBuckets = useCallback(async (currentLinkedBuckets: LinkedBucket[] = []) => {
    if (!userId) return;
    
    setLoadingAvailable(true);
    try {
      const res = await fetch('/api/services/object-storage/buckets/read_all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: userId }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to fetch buckets' }));
        throw new Error(errorData.error || 'Failed to fetch buckets');
      }
      
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Filter out already linked buckets and inactive ones
      const linkedIds = new Set(currentLinkedBuckets.map(b => b.bucket_id));
      const available = (data.data || []).filter(
        (bucket: AvailableBucket) => !linkedIds.has(bucket.id) && bucket.status === 'active'
      );

      setAvailableBuckets(available);
    } catch (err) {
      console.error('Error fetching available buckets:', err);
    } finally {
      setLoadingAvailable(false);
    }
  }, [userId]);

  // Initial load
  useEffect(() => {
    fetchLinkedBuckets();
  }, [fetchLinkedBuckets]);

  // Fetch available buckets when modal opens
  useEffect(() => {
    if (linkModalOpen && userId) {
      fetchAvailableBuckets(linkedBuckets);
    }
  }, [linkModalOpen, userId, linkedBuckets, fetchAvailableBuckets]);

  // Handle create bucket
  const handleCreateBucket = async (data: {
    name: string;
    region: string;
    project_id: string;
    acl?: 'private' | 'public-read';
    cors_enabled?: boolean;
    versioning_enabled?: boolean;
  }): Promise<{ success: boolean; bucket_id?: string; error?: string }> => {
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    try {
      const res = await fetch('/api/services/object-storage/buckets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bucket',
          name: data.name,
          region: data.region,
          project_id: data.project_id,
          owner_id: userId,
          acl: data.acl || 'private',
          cors_enabled: data.cors_enabled ?? false,
          versioning_enabled: data.versioning_enabled ?? false,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        return { success: false, error: result.error || result.message || 'Failed to create bucket' };
      }

      return {
        success: true,
        bucket_id: result?.data?.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  };

  // Handle link bucket
  const handleLink = async (
    bucketId: string, 
    envConfigs: EnvVarConfig[],
    force: boolean,
    includeAwsVars: boolean = false
  ): Promise<LinkStorageResponse> => {
    try {
      const res = await fetch('/api/services/platform-apps/integrations/storage/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          bucket_id: bucketId,
          env_configs: envConfigs,
          force,
          includeAwsVars,
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

  // Retry a failed integration by re-linking with the same env var keys
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRetry = async (bucketId: string): Promise<void> => {
    if (retryingId) return; // prevent concurrent retries
    const bucket = linkedBuckets.find(b => b.bucket_id === bucketId);
    if (!bucket) return;

    setRetryingId(bucketId);
    try {
      const envConfigs: EnvVarConfig[] = bucket.injected_vars.map((key) => ({
        originalKey: key,
        customKey: key,
        value: '(fetched securely on link)',
        description: key,
      }));

      const res = await fetch('/api/services/platform-apps/integrations/storage/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          bucket_id: bucketId,
          env_configs: envConfigs,
          force: true,
          includeAwsVars: false,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Retry failed');

      toast.success('Storage integration recovered successfully');
      await fetchLinkedBuckets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to retry integration');
    } finally {
      setRetryingId(null);
    }
  };

  // Open edit modal
  const handleEdit = (bucketId: string) => {
    const bucket = linkedBuckets.find(b => b.bucket_id === bucketId);
    if (bucket) {
      setEditTarget(bucket);
      setEditModalOpen(true);
    }
  };

  // Open unlink confirmation modal
  const handleUnlink = async (bucketId: string): Promise<void> => {
    const bucket = linkedBuckets.find(b => b.bucket_id === bucketId);
    if (bucket) {
      setUnlinkTarget(bucket);
      setUnlinkModalOpen(true);
    }
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

    const targetId = unlinkTarget.bucket_id;
    
    // Close modal immediately
    setUnlinkModalOpen(false);
    setUnlinkTarget(null);
    
    // Execute unlink in background
    setUnlinkingId(targetId);

    try {
      const res = await fetch('/api/services/platform-apps/integrations/storage/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          bucket_id: targetId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to unlink bucket');
      }

      // Refresh the list
      await fetchLinkedBuckets();
    } catch (err) {
      console.error('Error unlinking bucket:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to unlink bucket');
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
              <Archive className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white truncate">Object Storage Integrations</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLinkedBuckets}
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
              Link Bucket
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
          ) : linkedBuckets.length === 0 ? (
            <div className="py-10 text-center">
              <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[8px] border border-white/[0.08] bg-[#0d0e11]">
                <Archive className="h-5 w-5 text-white/30" />
              </span>
              <h4 className="mb-1.5 text-[14px] font-semibold text-white">No Buckets Linked</h4>
              <p className={`${MONO} mb-4 text-[11px] tracking-[0.04em] text-white/40`}>
                Connect an S3-compatible bucket to automatically inject credentials
              </p>
              <button
                onClick={() => setLinkModalOpen(true)}
                className={`${MONO} inline-flex items-center gap-1.5 rounded-[5px] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white`}
                style={{ background: 'linear-gradient(135deg,#0095FF,#0066B3)', boxShadow: '0 8px 20px rgba(0,149,255,0.20)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Link Your First Bucket
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {linkedBuckets.map((bucket) => (
                <LinkedStorageCard
                  key={bucket.integration_id}
                  bucket={bucket}
                  onUnlink={handleUnlink}
                  onEdit={handleEdit}
                  onRetry={handleRetry}
                  unlinking={unlinkingId === bucket.bucket_id}
                  retrying={retryingId === bucket.bucket_id}
                />
              ))}
            </div>
          )}

          {/* Info */}
          {linkedBuckets.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <p className={`${MONO} text-[10.5px] leading-relaxed tracking-[0.02em] text-white/40`}>
                Linked buckets automatically inject S3 credentials (S3_BUCKET, S3_ACCESS_KEY_ID, etc.)
                into your app. Changes trigger a redeploy if the app is running.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Link Modal */}
      <LinkStorageModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        appName={appName}
        projectId={projectId}
        buckets={availableBuckets}
        loadingBuckets={loadingAvailable}
        onLink={handleLink}
        onCreateBucket={handleCreateBucket}
        onSuccess={fetchLinkedBuckets}
      />

      {/* Unlink Confirmation Modal */}
      <UnlinkConfirmationModal
        open={unlinkModalOpen}
        onOpenChange={handleUnlinkModalClose}
        onConfirm={confirmUnlink}
        isUnlinking={unlinkingId === unlinkTarget?.bucket_id}
        resourceType="bucket"
        resourceName={unlinkTarget?.bucket_name || ''}
        injectedVars={unlinkTarget?.injected_vars || []}
      />

      {/* Edit Storage Integration Modal */}
      <EditStorageIntegrationModal
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) setEditTarget(null);
        }}
        appId={appId}
        integration={editTarget}
        onSuccess={() => {
          setEditModalOpen(false);
          setEditTarget(null);
          fetchLinkedBuckets();
        }}
      />
    </>
  );
}
