'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { EnvConfigStep } from './env-config-step';
import type { LinkedDatabase, EnvVarConfig } from './types';

const MONO = "font-[var(--font-geist-mono),ui-monospace,monospace]";

interface EditIntegrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  integration: LinkedDatabase | null;
  onSuccess: () => void;
}

export function EditIntegrationModal({
  open,
  onOpenChange,
  appId,
  integration,
  onSuccess,
}: EditIntegrationModalProps) {
  const [envConfigs, setEnvConfigs] = useState<EnvVarConfig[]>([]);
  const [saving, setSaving] = useState(false);

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
      <DialogContent className="bg-[#0c0d11] border border-white/[0.08] rounded-[10px] text-white p-0 gap-0 overflow-hidden max-w-[480px] max-h-[90svh] flex flex-col [&_[data-slot=dialog-close]]:text-white/35 [&_[data-slot=dialog-close]]:hover:text-white/75 [&_[data-slot=dialog-close]]:hover:bg-white/[0.06]">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-white/[0.06] pr-14 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-[6px] bg-[#0095FF]/[0.12] border border-[#0095FF]/20 flex items-center justify-center flex-shrink-0">
              <Pencil className="h-3.5 w-3.5 text-[#0095FF]" />
            </div>
            <DialogTitle className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              Edit Integration
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] text-white/45 leading-relaxed pl-[38px]">
            Rename env vars for{' '}
            <span className="text-white/70">
              {integration.database_name || 'database'}
            </span>
            . A redeploy will be triggered.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 flex-1 min-h-0 overflow-y-auto">
          <EnvConfigStep
            envVarConfigs={envConfigs}
            onChange={setEnvConfigs}
            conflicts={[]}
            disabled={saving}
          />
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-white/[0.06] flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-9 px-4 rounded-[5px] text-[13px] font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 min-w-[116px] items-center justify-center gap-2 rounded-[5px] border border-[#0095FF]/30 bg-[#0d0e11] px-4 text-[13px] font-medium text-[#0095FF] transition-colors hover:bg-[#0095FF]/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Changes
          </button>
        </div>
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
