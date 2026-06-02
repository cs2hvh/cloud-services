'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Archive,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";
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
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
        {/* Header */}
        <div className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5 text-white/45" />
            <span className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/65 font-semibold`}>
              Object Storage Integrations
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLinkedBuckets}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-white/[0.08] bg-[#0d0e11] text-white/45 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
              aria-label="Refresh storage integrations"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10]"
            >
              <Plus className="h-3.5 w-3.5" />
              Link Bucket
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/35" />
            </div>
          ) : error ? (
            <div className={`${MONO} flex items-center gap-2 border border-rose-500/20 bg-rose-500/[0.05] rounded-[5px] px-3 py-3 text-[11.5px] text-rose-300`}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          ) : linkedBuckets.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="h-10 w-10 rounded-[6px] bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Archive className="h-5 w-5 text-white/20" />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-white/55">No buckets linked</p>
                <p className={`${MONO} text-[11.5px] text-white/30 mt-1`}>
                  Connect an S3-compatible bucket to inject credentials automatically
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-3 text-[12.5px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10]"
              >
                <Plus className="h-3.5 w-3.5" />
                Link Your First Bucket
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
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

          {linkedBuckets.length > 0 && (
            <p className={`${MONO} mt-4 pt-4 border-t border-white/[0.06] text-[10.5px] text-white/30`}>
              Linked buckets automatically inject S3 credentials (S3_BUCKET, S3_ACCESS_KEY_ID, etc.)
              into your app. Changes trigger a redeploy if the app is running.
            </p>
          )}
        </div>
      </div>

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
