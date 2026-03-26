'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { RegistrarSettings } from '@/components/dashboard/domains/domain-detail-types';
import { friendlyError } from '@/components/dashboard/domains/domain-detail-types';

interface DomainSettingsState {
  registrarLoading: boolean;
  registrarError: string | null;
  registrarSettings: RegistrarSettings | null;
  nameserversDraft: string;
  savingAutorenew: boolean;
  savingNameservers: boolean;
}

interface SettingsHandlers {
  loadRegistrarSettings: () => Promise<void>;
  onNameserversDraftChange: (value: string) => void;
  onToggleAutorenew: () => Promise<void>;
  onSaveNameservers: () => Promise<void>;
}

export function useDomainRegistrarSettings(
  domainName: string,
  onRefresh: () => Promise<void>,
  onSyncDomainMeta?: (expiresAt: string | null, autoRenew: boolean | null) => void
): DomainSettingsState & SettingsHandlers {
  const [registrarLoading, setRegistrarLoading] = useState(false);
  const [registrarError, setRegistrarError] = useState<string | null>(null);
  const [registrarSettings, setRegistrarSettings] = useState<RegistrarSettings | null>(null);
  const [nameserversDraft, setNameserversDraft] = useState('');
  const [savingAutorenew, setSavingAutorenew] = useState(false);
  const [savingNameservers, setSavingNameservers] = useState(false);
  const requestIdRef = useRef(0);

  const loadRegistrarSettings = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    if (!domainName) {
      if (isStale()) return;
      setRegistrarLoading(false);
      setRegistrarError(null);
      setRegistrarSettings(null);
      setNameserversDraft('');
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
        setNameserversDraft('');
        return;
      }

      if (!res.ok) {
        throw new Error(friendlyError(data, 'Unable to load domain settings. Refresh to try again.'));
      }

      const settings = (data?.data || null) as RegistrarSettings | null;
      setRegistrarSettings(settings);
      setNameserversDraft((settings?.nameservers || []).join('\n'));

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
      setNameserversDraft('');
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

  const onSaveNameservers = useCallback(async () => {
    if (!registrarSettings?.managed) {
      return;
    }

    const nameservers = nameserversDraft
      .split('\n')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (nameservers.length < 2) {
      toast.error('Please add at least two nameservers.');
      return;
    }

    setSavingNameservers(true);
    try {
      const res = await fetch('/api/domains/registrar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          nameservers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to update nameservers. Please try again.'));
        return;
      }

      toast.success('Nameservers updated. Changes may take up to 48 hours to fully propagate.');
      await onRefresh();
    } catch (err) {
      console.error('Failed to update nameservers:', err);
      toast.error('Failed to update nameservers. Please try again.');
    } finally {
      setSavingNameservers(false);
    }
  }, [domainName, nameserversDraft, registrarSettings, onRefresh]);

  return {
    registrarLoading,
    registrarError,
    registrarSettings,
    nameserversDraft,
    savingAutorenew,
    savingNameservers,
    loadRegistrarSettings,
    onNameserversDraftChange: setNameserversDraft,
    onToggleAutorenew,
    onSaveNameservers,
  };
}
