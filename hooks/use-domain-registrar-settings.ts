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
  savingNameservers: boolean;
}

interface SettingsHandlers {
  loadRegistrarSettings: () => Promise<void>;
  onToggleAutorenew: () => Promise<void>;
  onSetNameservers: (nameservers: string[]) => Promise<boolean>;
  onUseManagedNameservers: () => Promise<boolean>;
}

export function useDomainRegistrarSettings(
  domainName: string,
  onSyncDomainMeta?: (expiresAt: string | null, autoRenew: boolean | null) => void
): DomainSettingsState & SettingsHandlers {
  const [registrarLoading, setRegistrarLoading] = useState(false);
  const [registrarError, setRegistrarError] = useState<string | null>(null);
  const [registrarSettings, setRegistrarSettings] = useState<RegistrarSettings | null>(null);
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

      onSyncDomainMeta?.(
        normalizedExpiresAt,
        typeof settings?.autorenew_enabled === 'boolean' ? settings.autorenew_enabled : null
      );
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to load registrar settings:', err);
      setRegistrarError(
        err instanceof Error ? err.message : 'Unable to load domain settings. Refresh to try again.'
      );
      setRegistrarSettings(null);
    } finally {
      if (!isStale()) {
        setRegistrarLoading(false);
      }
    }
  }, [domainName, onSyncDomainMeta]);

  const syncSettings = useCallback(
    (updated: RegistrarSettings) => {
      setRegistrarSettings(updated);
      onSyncDomainMeta?.(
        typeof updated.expires_at === 'string' && updated.expires_at.trim()
          ? updated.expires_at
          : null,
        typeof updated.autorenew_enabled === 'boolean' ? updated.autorenew_enabled : null
      );
    },
    [onSyncDomainMeta]
  );

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

      const updated = data?.data as RegistrarSettings | null;
      if (updated) {
        syncSettings(updated);
      } else {
        await loadRegistrarSettings();
      }
    } catch (err) {
      console.error('Failed to update auto-renew:', err);
      toast.error('Failed to update auto-renew. Please try again.');
    } finally {
      setSavingAutorenew(false);
    }
  }, [domainName, registrarSettings, syncSettings, loadRegistrarSettings]);

  const onSetNameservers = useCallback(
    async (nameservers: string[]) => {
      if (!registrarSettings?.managed) {
        toast.error('Nameservers can only be changed for domains managed through your account.');
        return false;
      }

      setSavingNameservers(true);
      try {
        const res = await fetch('/api/domains/registrar', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domainName, nameservers }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(friendlyError(data, 'Failed to update nameservers. Please try again.'));
          return false;
        }

        const updated = data?.data as RegistrarSettings | null;
        if (updated) {
          syncSettings(updated);
        } else {
          await loadRegistrarSettings();
        }

        toast.success('Custom nameservers saved. Changes may take up to 48 hours to propagate.');
        return true;
      } catch (err) {
        console.error('Failed to update nameservers:', err);
        toast.error('Failed to update nameservers. Please try again.');
        // Re-fetch in case the registrar partially applied the change.
        await loadRegistrarSettings();
        return false;
      } finally {
        setSavingNameservers(false);
      }
    },
    [domainName, registrarSettings?.managed, syncSettings, loadRegistrarSettings]
  );

  const onUseManagedNameservers = useCallback(async () => {
    if (!registrarSettings?.managed) {
      toast.error('Nameservers can only be changed for domains managed through your account.');
      return false;
    }

    setSavingNameservers(true);
    try {
      const res = await fetch('/api/domains/registrar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainName, nameserver_mode: 'managed' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to update nameservers. Please try again.'));
        return false;
      }

      const updated = data?.data as RegistrarSettings | null;
      if (updated) {
        syncSettings(updated);
      } else {
        await loadRegistrarSettings();
      }

      toast.success(
        'Switched to Ahura managed nameservers. Changes may take up to 48 hours to propagate.'
      );
      return true;
    } catch (err) {
      console.error('Failed to update nameservers:', err);
      toast.error('Failed to update nameservers. Please try again.');
      // Re-fetch in case the registrar partially applied the change.
      await loadRegistrarSettings();
      return false;
    } finally {
      setSavingNameservers(false);
    }
  }, [domainName, registrarSettings?.managed, syncSettings, loadRegistrarSettings]);

  return {
    registrarLoading,
    registrarError,
    registrarSettings,
    savingAutorenew,
    savingNameservers,
    loadRegistrarSettings,
    onToggleAutorenew,
    onSetNameservers,
    onUseManagedNameservers,
  };
}
