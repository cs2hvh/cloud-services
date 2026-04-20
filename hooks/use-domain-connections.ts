'use client';

import { useCallback, useState } from 'react';
import type React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { DomainConnectionItem } from '@/components/dashboard/domains/domain-detail-types';
import {
  friendlyError,
  normalizeDomain,
  operationFailureFallback,
  sanitizeOperationError,
} from '@/components/dashboard/domains/domain-detail-types';

interface DomainConnectionsState {
  verifyingConnectionId: string | null;
  activatingConnectionId: string | null;
  settingPrimaryConnectionId: string | null;
  removingConnectionId: string | null;
  removeConfirmConnectionId: string | null;
  checkingSslId: string | null;
  anyOperationRunning: boolean;
}

interface ConnectionHandlers {
  onVerify: (id: string) => void;
  onActivate: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onRemoveRequest: (id: string) => void;
  onRemoveConfirm: (id: string) => void;
  onRemoveCancel: () => void;
  onCheckSsl: (id: string) => void;
}

async function pollOperation(operationId: string): Promise<Record<string, unknown> | null> {
  const maxAttempts = 75;
  const delayMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch(`/api/domains/operations/${operationId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error('Unable to check setup status. Please refresh and try again.');
    }

    const status = data?.operation?.status;
    if (status === 'succeeded') {
      return (data?.operation?.response_data || null) as Record<string, unknown> | null;
    }
    if (status === 'failed') {
      const errorCode = data?.operation?.error_code;
      const rawMsg = data?.operation?.error_message;
      throw new Error(sanitizeOperationError(rawMsg, operationFailureFallback(errorCode)));
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Setup is taking longer than expected. Refresh to check the current status.');
}

export function useDomainConnections(
  domainName: string,
  connections: DomainConnectionItem[],
  setConnections: React.Dispatch<React.SetStateAction<DomainConnectionItem[]>>,
  onRefresh: () => Promise<void>
): DomainConnectionsState & ConnectionHandlers {
  const router = useRouter();
  const [verifyingConnectionId, setVerifyingConnectionId] = useState<string | null>(null);
  const [activatingConnectionId, setActivatingConnectionId] = useState<string | null>(null);
  const [settingPrimaryConnectionId, setSettingPrimaryConnectionId] = useState<string | null>(null);
  const [removingConnectionId, setRemovingConnectionId] = useState<string | null>(null);
  const [removeConfirmConnectionId, setRemoveConfirmConnectionId] = useState<string | null>(null);
  const [checkingSslId, setCheckingSslId] = useState<string | null>(null);

  const onCheckSsl = useCallback(
    async (domainId: string) => {
      setCheckingSslId(domainId);
      try {
        const res = await fetch(`/api/domains/${domainId}/check-ssl`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          toast.error(friendlyError(data, 'Could not check SSL status.'));
          return;
        }

        // Optimistically update the connection state so badges reflect dns info immediately.
        if (data.dns_ready !== undefined || data.ssl_status) {
          setConnections((prev) =>
            prev.map((c) =>
              c.id === domainId
                ? {
                    ...c,
                    sslStatus: data.ssl_status ?? c.sslStatus,
                    dnsReady: data.dns_ready,
                    dnsMessage: data.dns_message ?? undefined,
                  }
                : c,
            ),
          );
        }

        if (data.ssl_status === 'active') {
          toast.success('Secure connection is now active — connection is fully encrypted.');
        } else if (data.ssl_status === 'issuing') {
          if (data.dns_ready === false && data.dns_message) {
            toast.warning(`DNS not ready: ${data.dns_message}`);
          } else {
            toast.info('Certificate is still being issued. Check again in a minute.');
          }
        } else if (data.ssl_status === 'failed') {
          toast.error('Secure connection failed. Check DNS and re-activate the domain.');
        }
        await onRefresh();
      } catch {
        toast.error('SSL check failed. Please try again.');
      } finally {
        setCheckingSslId(null);
      }
    },
    [onRefresh, setConnections]
  );

  const onVerify = useCallback(
    async (domainId: string) => {
      setVerifyingConnectionId(domainId);
      try {
        const res = await fetch(`/api/domains/${domainId}/verify`, { method: 'POST' });
        const data = await res.json();

        if (data?.verified) {
          const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
          toast.success(
            `${connectionDomain ? `${connectionDomain} verified` : 'Domain verified'} — you can now activate it.`
          );
          await onRefresh();
          return;
        }

        toast.error(
          friendlyError(
            data,
            'Verification failed — check that your TXT record exactly matches the value shown and try again.'
          )
        );
      } catch (err) {
        console.error('Failed to verify domain:', err);
        toast.error('Verification check failed. Check your connection and try again.');
      } finally {
        setVerifyingConnectionId(null);
      }
    },
    [connections, onRefresh]
  );

  const onActivate = useCallback(
    async (domainId: string) => {
      setActivatingConnectionId(domainId);
      const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
      try {
        const res = await fetch(`/api/domains/${domainId}/activate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          toast.error(friendlyError(data, 'Activation failed. Please try again.'));
          return;
        }

        let responseData: Record<string, unknown> | null = null;
        if (data?.operation_id) {
          toast.info(`Setting up ${connectionDomain || 'domain'}… this may take up to 2 minutes.`);
          responseData = await pollOperation(String(data.operation_id));
        }

        const dnsAutoConfigured =
          responseData && typeof responseData.dns_auto_configured === 'boolean'
            ? responseData.dns_auto_configured
            : true;
        const routingInstructions =
          responseData && typeof responseData.routing_instructions === 'object'
            ? (responseData.routing_instructions as Record<string, unknown>)
            : null;

        if (!dnsAutoConfigured && routingInstructions) {
          const recordType =
            typeof routingInstructions.record_type === 'string'
              ? routingInstructions.record_type
              : 'DNS';
          const recordName =
            typeof routingInstructions.record_name === 'string'
              ? routingInstructions.record_name
              : connectionDomain || domainName;
          const recordValue =
            typeof routingInstructions.record_value === 'string'
              ? routingInstructions.record_value
              : '';
          toast.warning(
            `${connectionDomain || 'Domain'} activated. Add ${recordType} ${recordName}${
              recordValue ? ` -> ${recordValue}` : ''
            } at your DNS provider.`
          );
        } else if (!dnsAutoConfigured) {
          toast.warning(
            `${connectionDomain || 'Domain'} activated. Update DNS at your provider, then secure connection will finish.`
          );
        } else {
          toast.success(
            `${connectionDomain || 'Domain'} is now live—secure connection setup will be ready shortly.`
          );
        }
        await onRefresh();
      } catch (err) {
        console.error('Failed to activate domain:', err);
        toast.error(err instanceof Error ? err.message : 'Activation failed. Please try again.');
      } finally {
        setActivatingConnectionId(null);
      }
    },
    [connections, domainName, onRefresh]
  );

  const onSetPrimary = useCallback(
    async (domainId: string) => {
      setSettingPrimaryConnectionId(domainId);
      const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
      try {
        const res = await fetch(`/api/domains/${domainId}/set-primary`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          toast.error(friendlyError(data, 'Failed to update primary domain. Please try again.'));
          return;
        }
        toast.success(`${connectionDomain || 'Domain'} is now your primary domain.`);
        await onRefresh();
      } catch (err) {
        console.error('Failed to set primary domain:', err);
        toast.error('Failed to update primary domain. Please try again.');
      } finally {
        setSettingPrimaryConnectionId(null);
      }
    },
    [connections, onRefresh]
  );

  const onRemoveConfirm = useCallback(
    async (domainId: string) => {
      const connectionDomain = connections.find((c) => c.id === domainId)?.domain;
      setRemovingConnectionId(domainId);
      try {
        const res = await fetch(`/api/domains/${domainId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          toast.error(friendlyError(data, 'Failed to remove connection. Please try again.'));
          return;
        }
        toast.success(`${connectionDomain ? `${connectionDomain} disconnected` : 'Connection removed'} from this app.`);

        if (connectionDomain && normalizeDomain(connectionDomain) === domainName) {
          const remainingConnections = connections.filter((c) => c.id !== domainId);
          const stillOwned = remainingConnections.some((c) => {
            const d = normalizeDomain(c.domain);
            return d === domainName || d.endsWith(`.${domainName}`);
          });
          if (!stillOwned) {
            router.push('/dashboard/domains');
            return;
          }
        }
        await onRefresh();
      } catch (err) {
        console.error('Failed to remove domain connection:', err);
        toast.error('Failed to remove connection. Please try again.');
      } finally {
        setRemovingConnectionId(null);
        setRemoveConfirmConnectionId(null);
      }
    },
    [connections, domainName, onRefresh, router]
  );

  const anyOperationRunning = !!(verifyingConnectionId || activatingConnectionId || settingPrimaryConnectionId || removingConnectionId || checkingSslId);

  return {
    verifyingConnectionId,
    activatingConnectionId,
    settingPrimaryConnectionId,
    removingConnectionId,
    removeConfirmConnectionId,
    checkingSslId,
    anyOperationRunning,
    onVerify,
    onActivate,
    onSetPrimary,
    onRemoveRequest: setRemoveConfirmConnectionId,
    onRemoveConfirm,
    onRemoveCancel: () => setRemoveConfirmConnectionId(null),
    onCheckSsl,
  };
}
