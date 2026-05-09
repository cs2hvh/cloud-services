'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DnsFormState, DnsRecordItem } from '@/components/dashboard/domains/domain-detail-types';
import { friendlyError } from '@/components/dashboard/domains/domain-detail-types';

const DEFAULT_DNS_FORM: DnsFormState = {
  recordId: null,
  type: 'A',
  host: '@',
  answer: '',
  ttl: 300,
  priority: '',
};

interface DomainDnsState {
  dnsLoading: boolean;
  dnsError: string | null;
  dnsManaged: boolean | null;
  dnsZone: string | null;
  dnsRecords: DnsRecordItem[];
  dnsForm: DnsFormState;
  dnsSaving: boolean;
  dnsDeletingRecordId: number | null;
  deleteConfirmRecordId: number | null;
}

interface DnsHandlers {
  loadDnsRecords: () => Promise<void>;
  onFormChange: (patch: Partial<DnsFormState>) => void;
  onEditRecord: (record: DnsRecordItem) => void;
  onSaveRecord: () => Promise<void>;
  onCancelEdit: () => void;
  onDeleteRequest: (id: number) => void;
  onDeleteConfirm: (id: number) => Promise<void>;
  onDeleteCancel: () => void;
}

export function useDomainDns(
  domainName: string
): DomainDnsState & DnsHandlers {
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsError, setDnsError] = useState<string | null>(null);
  const [dnsManaged, setDnsManaged] = useState<boolean | null>(null);
  const [dnsZone, setDnsZone] = useState<string | null>(null);
  const [dnsRecords, setDnsRecords] = useState<DnsRecordItem[]>([]);
  const [dnsForm, setDnsForm] = useState<DnsFormState>(DEFAULT_DNS_FORM);
  const [dnsSaving, setDnsSaving] = useState(false);
  const [dnsDeletingRecordId, setDnsDeletingRecordId] = useState<number | null>(null);
  const [deleteConfirmRecordId, setDeleteConfirmRecordId] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const loadDnsRecords = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    if (!domainName) {
      if (isStale()) return;
      setDnsLoading(false);
      setDnsError(null);
      setDnsManaged(null);
      setDnsZone(null);
      setDnsRecords([]);
      return;
    }

    setDnsLoading(true);
    setDnsError(null);

    try {
      const res = await fetch(`/api/domains/dns?domain=${encodeURIComponent(domainName)}`);
      const data = await res.json();
      if (isStale()) return;

      if (res.status === 404 && data?.error === 'NOT_FOUND') {
        setDnsManaged(null);
        setDnsZone(null);
        setDnsRecords([]);
        return;
      }

      if (!res.ok) {
        throw new Error(friendlyError(data, 'Unable to load DNS records. Refresh to try again.'));
      }

      setDnsManaged(Boolean(data?.data?.managed));
      setDnsZone((data?.data?.zone || null) as string | null);
      setDnsRecords((data?.data?.records || []) as DnsRecordItem[]);
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to load DNS records:', err);
      setDnsError(err instanceof Error ? err.message : 'Unable to load DNS records. Refresh to try again.');
      setDnsManaged(null);
      setDnsZone(null);
      setDnsRecords([]);
    } finally {
      if (!isStale()) {
        setDnsLoading(false);
      }
    }
  }, [domainName]);

  const onFormChange = useCallback((patch: Partial<DnsFormState>) => {
    setDnsForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetDnsForm = useCallback(() => setDnsForm(DEFAULT_DNS_FORM), []);

  const onEditRecord = useCallback((record: DnsRecordItem) => {
    setDnsForm({
      recordId: record.id,
      type: (record.type?.toUpperCase() as DnsFormState['type']) || 'A',
      host: record.host || '@',
      answer: record.answer || '',
      ttl: Number(record.ttl || 300),
      priority: record.priority !== null ? String(record.priority) : '',
    });
  }, []);

  const onSaveRecord = useCallback(async () => {
    if (!dnsManaged) {
      toast.error('DNS records can only be edited for domains managed through your account.');
      return;
    }

    const answer = dnsForm.answer.trim();
    const host = (dnsForm.host.trim() || '@').toLowerCase();
    const ttl = Number.isFinite(dnsForm.ttl)
      ? Math.max(60, Math.min(86400, Math.floor(dnsForm.ttl)))
      : 300;
    const needsPriority = dnsForm.type === 'MX' || dnsForm.type === 'SRV';
    const priorityNumber = dnsForm.priority.trim() ? Number(dnsForm.priority.trim()) : NaN;

    if (!answer) {
      toast.error('Record value is required.');
      return;
    }
    if (host === '@' && dnsForm.type === 'CNAME') {
      toast.error('The root domain cannot use a CNAME record. Use A or ANAME instead.');
      return;
    }
    if (
      needsPriority &&
      (!Number.isInteger(priorityNumber) || priorityNumber < 0 || priorityNumber > 65535)
    ) {
      toast.error(`${dnsForm.type} records require a priority value between 0 and 65535.`);
      return;
    }

    setDnsSaving(true);
    try {
      const method = dnsForm.recordId ? 'PATCH' : 'POST';
      const res = await fetch('/api/domains/dns', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName,
          record_id: dnsForm.recordId ?? undefined,
          type: dnsForm.type,
          host,
          answer,
          ttl,
          priority: needsPriority ? priorityNumber : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(friendlyError(data, 'Failed to save DNS record. Please try again.'));
        return;
      }

      toast.success(dnsForm.recordId ? 'DNS record updated.' : 'DNS record added.');
      resetDnsForm();
      await loadDnsRecords();
    } catch (err) {
      console.error('Failed to save DNS record:', err);
      toast.error('Failed to save DNS record. Please try again.');
    } finally {
      setDnsSaving(false);
    }
  }, [dnsForm, dnsManaged, domainName, resetDnsForm, loadDnsRecords]);

  const onDeleteConfirm = useCallback(
    async (recordId: number) => {
      if (!dnsManaged) return;
      setDeleteConfirmRecordId(null);

      setDnsDeletingRecordId(recordId);
      try {
        const res = await fetch('/api/domains/dns', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: domainName,
            record_id: recordId,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(friendlyError(data, 'Failed to delete DNS record. Please try again.'));
          return;
        }

        toast.success('DNS record deleted.');
        if (dnsForm.recordId === recordId) {
          resetDnsForm();
        }
        await loadDnsRecords();
      } catch (err) {
        console.error('Failed to delete DNS record:', err);
        toast.error('Failed to delete DNS record. Please try again.');
      } finally {
        setDnsDeletingRecordId(null);
      }
    },
    [dnsForm.recordId, dnsManaged, domainName, resetDnsForm, loadDnsRecords]
  );

  return {
    dnsLoading,
    dnsError,
    dnsManaged,
    dnsZone,
    dnsRecords,
    dnsForm,
    dnsSaving,
    dnsDeletingRecordId,
    deleteConfirmRecordId,
    loadDnsRecords,
    onFormChange,
    onEditRecord,
    onSaveRecord,
    onCancelEdit: resetDnsForm,
    onDeleteRequest: setDeleteConfirmRecordId,
    onDeleteConfirm,
    onDeleteCancel: () => setDeleteConfirmRecordId(null),
  };
}
