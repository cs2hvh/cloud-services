'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { RegistrarSettings } from '@/components/dashboard/domains/domain-detail-types';
import { friendlyError } from '@/components/dashboard/domains/domain-detail-types';

interface DomainSettingsState {
  registrarLoading: boolean;
  registrarError: string | null;
  registrarSettings: RegistrarSettings | null;
  savingAutorenew: boolean;
}

interface SettingsHandlers {
  loadRegistrarSettings: () => Promise<void>;
  onToggleAutorenew: () => Promise<void>;
}

export function useDomainRegistrarSettings(
  domainName: string,
  onRefresh: () => Promise<void>,
  onSyncDomainMeta?: (expiresAt: string | null, autoRenew: boolean | null) => void
): DomainSettingsState & SettingsHandlers {
  const [registrarLoading, setRegistrarLoading] = useState(false);
  const [registrarError, setRegistrarError] = useState<string | null>(null);
  const [registrarSettings, setRegistrarSettings] = useState<RegistrarSettings | null>(null);
  const [savingAutorenew, setSavingAutorenew] = useState(false);
  const requestIdRef = useRef(0);

  const loadRegistrarSettings = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    if (!domainName) {
      if (isStale()) return;
      setRegistrarLoading(false);
      setRegistrarError(null);
      setRegistrarSettings(null);
      return;
    }

    setRegistrarLoading(true);
    setRegistrarError(null);

    try {
      const res = await fetch(`/api/domains/registrar?domain=${encodeURIComponent(domainName)}`);
      const data = await res.json();
      if (isStale()) return;

      if (res.status === 404 && data?.error === 'NOT_FOUND') {
        setRegistrarSettings(null);
        return;
      }

      if (!res.ok) {
        throw new Error(friendlyError(data, 'Unable to load domain settings. Refresh to try again.'));
      }

      const settings = (data?.data || null) as RegistrarSettings | null;
      setRegistrarSettings(settings);

      const normalizedExpiresAt =
        typeof settings?.expires_at === 'string' && settings.expires_at.trim()
          ? settings.expires_at
          : null;

      // Sync expiry and auto-renew back to the domain header state.
      onSyncDomainMeta?.(
        normalizedExpiresAt,
        typeof settings?.autorenew_enabled === 'boolean' ? settings.autorenew_enabled : null
      );
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to load registrar settings:', err);
      setRegistrarError(err instanceof Error ? err.message : 'Unable to load domain settings. Refresh to try again.');
      setRegistrarSettings(null);
    } finally {
      if (!isStale()) {
        setRegistrarLoading(false);
      }
    }
  }, [domainName, onSyncDomainMeta]);

  const onToggleAutorenew = useCallback(async () => {
    if (!registrarSettings?.managed || typeof registrarSettings.autorenew_enabled !== 'boolean') {
      return;
    }

    setSavingAutorenew(true);
    try {
      const res = await fetch('/api/domains/registrar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          autorenew_enabled: !registrarSettings.autorenew_enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to update auto-renew. Please try again.'));
        return;
      }

      toast.success(`Auto-renew ${data?.data?.autorenew_enabled ? 'enabled' : 'turned off'}.`);
      await onRefresh();
    } catch (err) {
      console.error('Failed to update auto-renew:', err);
      toast.error('Failed to update auto-renew. Please try again.');
    } finally {
      setSavingAutorenew(false);
    }
  }, [domainName, registrarSettings, onRefresh]);

  return {
    registrarLoading,
    registrarError,
    registrarSettings,
    savingAutorenew,
    loadRegistrarSettings,
    onToggleAutorenew,
  };
}
