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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EnvConfigStep } from './env-config-step';
import type { LinkedDatabase, EnvVarConfig } from './types';

interface EditIntegrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  integration: LinkedDatabase | null;
  onSuccess: () => void;
}

/**
 * Modal for renaming injected env var keys on an existing integration.
 * Calls PUT /api/services/platform-apps/integrations/update with env_mapping.
 */
export function EditIntegrationModal({
  open,
  onOpenChange,
  appId,
  integration,
  onSuccess,
}: EditIntegrationModalProps) {
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // Build env configs from the integration's current injected keys
  useEffect(() => {
    if (!integration) return;

    const configs: EnvVarConfig[] = (integration.injected_env_keys || []).map((key) => ({
      originalKey: key,
      customKey: key,
      value: '(fetched securely on link)',
      description: describeKey(key),
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
      const res = await fetch('/api/services/platform-apps/integrations/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          database_id: integration.database_cluster_id,
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
      toast.error(err instanceof Error ? err.message : 'Failed to update integration');
    } finally {
      setSaving(false);
    }
  };

  if (!integration) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-neutral-900 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            Edit Integration — {integration.database_name || 'Database'}
          </DialogTitle>
          <DialogDescription className="text-white/50 text-sm">
            Rename the environment variables injected into your app. A redeploy will be triggered.
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
            className="bg-blue-600 hover:bg-blue-700"
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

function describeKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('_url') || lower.endsWith('_uri')) return 'Full connection URL';
  if (lower.endsWith('_host')) return 'Hostname';
  if (lower.endsWith('_port')) return 'Port number';
  if (lower.endsWith('_user')) return 'Username';
  if (lower.endsWith('_password')) return 'Password';
  if (lower.endsWith('_name')) return 'Database name';
  if (lower.endsWith('_ssl')) return 'SSL mode';
  return key;
}
