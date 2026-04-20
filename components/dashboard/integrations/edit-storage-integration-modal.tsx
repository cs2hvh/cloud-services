'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { EnvConfigStep } from './env-config-step';
import type { LinkedBucket, EnvVarConfig } from './types';

interface EditStorageIntegrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  integration: LinkedBucket | null;
  onSuccess: () => void;
}

/**
 * Modal for renaming injected env var keys on an existing storage integration.
 * Calls PUT /api/services/platform-apps/integrations/storage/update with env_mapping.
 */
export function EditStorageIntegrationModal({
  open,
  onOpenChange,
  appId,
  integration,
  onSuccess,
}: EditStorageIntegrationModalProps) {
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // Build env configs from the integration's current injected keys
  useEffect(() => {
    if (!integration) return;

    const configs: EnvVarConfig[] = (integration.injected_vars || []).map((key) => ({
      originalKey: key,
      customKey: key,
      value: '(fetched securely on link)',
      description: describeStorageKey(key),
    }));

    setEnvConfigs(configs);
  }, [integration]);

  const handleSave = async () => {
    if (!integration) return;

    // Build mapping only for changed keys
    const env_mapping: Record<string, string> = {};
    let hasChanges = false;
    for (const c of envConfigs) {
      if (c.customKey !== c.originalKey) {
        env_mapping[c.originalKey] = c.customKey;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/services/platform-apps/integrations/storage/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          bucket_id: integration.bucket_id,
          env_mapping,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Update failed');
      }

      toast.success('Environment variable names updated');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update storage integration');
    } finally {
      setSaving(false);
    }
  };

  if (!integration) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-neutral-900 border-neutral-800 text-white">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Archive className="w-5 h-5 text-neutral-300" />
            <DialogTitle className="text-base font-medium">
              Edit Storage Integration — {integration.bucket_name}
            </DialogTitle>
          </div>
          <DialogDescription className="text-white/50 text-sm">
            Rename the environment variables injected into your app. A redeploy will be triggered if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <EnvConfigStep
            envVarConfigs={envConfigs}
            onChange={setEnvConfigs}
            conflicts={[]}
            disabled={saving}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-white/60 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeStorageKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('_endpoint')) return 'S3-compatible endpoint URL';
  if (lower.endsWith('_endpoint_url')) return 'S3-compatible endpoint URL';
  if (lower.endsWith('_access_key_id')) return 'Access key ID';
  if (lower.endsWith('_secret_access_key')) return 'Secret access key';
  if (lower.endsWith('_region') || lower.endsWith('_default_region')) return 'Region';
  if (lower.endsWith('_bucket') || lower.endsWith('_bucket_name')) return 'Bucket name';
  return key;
}
