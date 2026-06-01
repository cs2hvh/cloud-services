'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  AppListItem,
  DomainInventoryItem,
  DomainConnectionItem,
  DomainPurchase,
} from '@/components/dashboard/domains/domain-detail-types';
import {
  friendlyError,
  hostLabelFor,
} from '@/components/dashboard/domains/domain-detail-types';

export interface DomainDataState {
  apps: AppListItem[];
  purchaseRequest: DomainPurchase | null;
  connections: DomainConnectionItem[];
  expiresAt: string | null;
  autoRenew: boolean | null;
  loading: boolean;
  error: string | null;
}

export function useDomainData(domainName: string) {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [purchaseRequest, setPurchaseRequest] = useState<DomainPurchase | null>(null);
  const [connections, setConnections] = useState<DomainConnectionItem[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadDomainContext = useCallback(async (opts?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    if (!domainName) {
      if (isStale()) return;
      setApps([]);
      setPurchaseRequest(null);
      setConnections([]);
      setExpiresAt(null);
      setAutoRenew(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!opts?.silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/domains/inventory?domain=${encodeURIComponent(domainName)}`);
      const data = await res.json();
      if (isStale()) return;

      if (!res.ok) {
        throw new Error(friendlyError(data, 'Unable to load domain details. Refresh to try again.'));
      }

      const loadedApps = (data?.data?.apps || []) as AppListItem[];
      const domainItems = (data?.data?.domains || []) as DomainInventoryItem[];

      const rootItem = domainItems.find((item) => item.domain === domainName) || null;
      const relatedItems = domainItems.filter(
        (item) => item.domain === domainName || item.domain.endsWith(`.${domainName}`)
      );

      const connectionMap = new Map<string, DomainConnectionItem>();

      relatedItems.forEach((item) => {
        item.connections.forEach((connection) => {
          connectionMap.set(connection.id, {
            id: connection.id,
            appId: connection.app_id,
            appName: connection.app_name,
            appSlug: connection.app_slug || '',
            appStatus: connection.app_status,
            domain: connection.domain,
            hostLabel: hostLabelFor(connection.domain, domainName),
            status: connection.status,
            sslStatus: connection.ssl_status,
            isPrimary: connection.is_primary,
            verificationToken: connection.verification_token || '',
            routingTarget: connection.routing_target || '',
            routingIps: Array.isArray(connection.routing_ips)
              ? connection.routing_ips.filter((value) => typeof value === 'string')
              : [],
            lastError: connection.last_error,
          });
        });
      });

      const relatedConnections = Array.from(connectionMap.values()).sort((a, b) =>
        a.domain.localeCompare(b.domain)
      );

      setApps(loadedApps);
      setPurchaseRequest(rootItem?.purchase || null);
      // Preserve transient dnsReady/dnsMessage from previous state so background
      // refreshes don't wipe DNS check results the user just fetched.
      setConnections((prev) => {
        const prevMap = new Map(prev.map((c) => [c.id, c]));
        return relatedConnections.map((c) => {
          const old = prevMap.get(c.id);
          if (!old || (old.dnsReady === undefined && !old.dnsMessage)) return c;
          return { ...c, dnsReady: old.dnsReady, dnsMessage: old.dnsMessage };
        });
      });
      setExpiresAt(rootItem?.expires_at || null);
      setAutoRenew(rootItem?.auto_renew ?? null);
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to load domain details:', err);
      setError(err instanceof Error ? err.message : 'Unable to load domain details. Refresh to try again.');
      setApps([]);
      setPurchaseRequest(null);
      setConnections([]);
      setExpiresAt(null);
      setAutoRenew(null);
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [domainName]);

  const state: DomainDataState = {
    apps,
    purchaseRequest,
    connections,
    expiresAt,
    autoRenew,
    loading,
    error,
  };

  const setters = {
    setConnections,
    setExpiresAt,
    setAutoRenew,
  };

  return { ...state, ...setters, loadDomainContext };
}
