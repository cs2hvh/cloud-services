'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  HardDrive, 
  Plus, 
  Loader2, 
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { LinkedStorageCard } from './linked-storage-card';
import { LinkStorageModal } from './link-storage-modal';
import { UnlinkConfirmationModal } from './unlink-confirmation-modal';
import { createClient } from '@/lib/supabase/client';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkModalOpen, userId]);

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
        bucket_id: result.data?.id,
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
      alert(err instanceof Error ? err.message : 'Failed to unlink bucket');
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <>
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-purple-400" />
            Object Storage
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchLinkedBuckets}
              disabled={loading}
              className="text-white/60 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => setLinkModalOpen(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Link Bucket
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
          ) : linkedBuckets.length === 0 ? (
            <div className="text-center py-8">
              <HardDrive className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white/70 mb-2">No Buckets Linked</h3>
              <p className="text-sm text-white/50 mb-4">
                Connect an S3-compatible bucket to automatically inject credentials
              </p>
              <Button
                onClick={() => setLinkModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Link Your First Bucket
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {linkedBuckets.map((bucket) => (
                <LinkedStorageCard
                  key={bucket.integration_id}
                  bucket={bucket}
                  onUnlink={handleUnlink}
                  unlinking={unlinkingId === bucket.bucket_id}
                />
              ))}
            </div>
          )}

          {/* Info */}
          {linkedBuckets.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/40">
                💡 Linked buckets automatically inject S3 credentials (S3_BUCKET, S3_ACCESS_KEY_ID, etc.) 
                into your app. Changes trigger a redeploy if the app is running.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
    </>
  );
}
