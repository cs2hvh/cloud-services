'use client';

import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DnsFormState, DnsRecordItem, DomainConnectionItem, DnsRecordType } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'ANAME', 'CNAME', 'TXT', 'MX', 'NS', 'SRV'];

interface DomainDnsTabProps {
  connections: DomainConnectionItem[];
  dnsLoading: boolean;
  dnsError: string | null;
  dnsManaged: boolean | null;
  dnsZone: string | null;
  dnsRecords: DnsRecordItem[];
  dnsForm: DnsFormState;
  dnsSaving: boolean;
  dnsDeletingRecordId: number | null;
  deleteConfirmRecordId: number | null;
  domainName: string;
  onFormChange: (patch: Partial<DnsFormState>) => void;
  onEditRecord: (record: DnsRecordItem) => void;
  onSaveRecord: () => void;
  onCancelEdit: () => void;
  onDeleteRequest: (id: number) => void;
  onDeleteConfirm: (id: number) => void;
  onDeleteCancel: () => void;
}

export function DomainDnsTab({
  connections,
  dnsLoading,
  dnsError,
  dnsManaged,
  dnsZone,
  dnsRecords,
  dnsForm,
  dnsSaving,
  dnsDeletingRecordId,
  deleteConfirmRecordId,
  domainName,
  onFormChange,
  onEditRecord,
  onSaveRecord,
  onCancelEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: DomainDnsTabProps) {
  const needsPriority = dnsForm.type === 'MX' || dnsForm.type === 'SRV';
  const uniq = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

  return (
    <>
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-base">DNS Records</CardTitle>
          <CardDescription className="text-white/60">
            Manage the DNS records for this domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dnsError && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
              {looksInternal(dnsError)
                ? 'Unable to load DNS records. Refresh to try again.'
                : dnsError}
            </div>
          )}

          {dnsLoading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading DNS records...
            </div>
          ) : dnsManaged ? (
            <div className="space-y-3">
              {dnsZone && dnsZone !== domainName && (
                <p className="text-xs text-white/50">
                  Editing records for:{' '}
                  <span className="font-mono text-white/70">{dnsZone}</span>
                </p>
              )}

              {/* Add / Edit form */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                <p className="text-sm font-medium text-white">
                  {dnsForm.recordId ? 'Edit DNS Record' : 'Add DNS Record'}
                </p>
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="space-y-1">
                    <Label className="text-xs text-white/60">Type</Label>
                    <select
                      value={dnsForm.type}
                      onChange={(e) =>
                        onFormChange({ type: e.target.value as DnsRecordType })
                      }
                      className="h-9 w-full rounded-md border border-white/10 bg-black/30 px-2 text-sm text-white"
                    >
                      {DNS_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/60">Host</Label>
                    <Input
                      value={dnsForm.host}
                      onChange={(e) => onFormChange({ host: e.target.value })}
                      placeholder="@"
                      className="bg-black/30 border-white/10"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs text-white/60">Value</Label>
                    <Input
                      value={dnsForm.answer}
                      onChange={(e) => onFormChange({ answer: e.target.value })}
                      placeholder="Target, IP, text, or host"
                      className="bg-black/30 border-white/10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/60">TTL</Label>
                    <Input
                      type="number"
                      value={dnsForm.ttl}
                      onChange={(e) =>
                        onFormChange({ ttl: Number(e.target.value || 300) })
                      }
                      className="bg-black/30 border-white/10"
                    />
                  </div>
                </div>
                {needsPriority && (
                  <div className="space-y-1 max-w-xs">
                    <Label className="text-xs text-white/60">Priority</Label>
                    <Input
                      type="number"
                      value={dnsForm.priority}
                      onChange={(e) => onFormChange({ priority: e.target.value })}
                      placeholder="10"
                      className="bg-black/30 border-white/10"
                    />
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  {dnsForm.recordId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={onCancelEdit}
                    >
                      Cancel Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="bg-white text-black hover:bg-white/90"
                    disabled={dnsSaving}
                    onClick={onSaveRecord}
                  >
                    {dnsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {dnsForm.recordId ? 'Update Record' : 'Add Record'}
                  </Button>
                </div>
              </div>

              {/* Records table */}
              {dnsRecords.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/55">
                  No DNS records found for this managed zone.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-white/70">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Host</th>
                        <th className="px-3 py-2 text-left font-medium">Answer</th>
                        <th className="px-3 py-2 text-left font-medium">TTL</th>
                        <th className="px-3 py-2 text-left font-medium">Priority</th>
                        <th className="px-3 py-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dnsRecords.map((record) => (
                        <tr
                          key={`${record.id ?? record.host}:${record.type}:${record.answer}`}
                          className="border-t border-white/10 text-white/80"
                        >
                          <td className="px-3 py-2">{record.type}</td>
                          <td className="px-3 py-2">{record.host}</td>
                          <td className="px-3 py-2 break-all">{record.answer}</td>
                          <td className="px-3 py-2">{record.ttl}</td>
                          <td className="px-3 py-2">{record.priority ?? '-'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-white/20 text-white hover:bg-white/10"
                                onClick={() => onEditRecord(record)}
                              >
                                Edit
                              </Button>
                              {record.id !== null && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-red-500/30 text-red-200 hover:bg-red-500/10"
                                  disabled={dnsDeletingRecordId === record.id}
                                  onClick={() => onDeleteRequest(record.id as number)}
                                >
                                  {dnsDeletingRecordId === record.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    'Delete'
                                  )}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : connections.length === 0 ? (
            <p className="text-sm text-white/55">
              Connect this domain to an app first to see DNS routing guidance.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-white/60">
                This domain is not in your account&apos;s managed DNS zone. Add the following
                records at your current DNS provider:
              </p>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((connection) => {
                      const rootIps = uniq(connection.routingIps);
                      const isRoot = connection.hostLabel === '@';
                      const hostCell = isRoot ? '@' : connection.hostLabel;

                      // Apex with multiple IPs → one A record row per IP
                      if (isRoot && rootIps.length > 1) {
                        return rootIps.map((ip, idx) => (
                          <tr
                            key={`${connection.id}-dns-${idx}`}
                            className="border-t border-white/10 text-white/80"
                          >
                            <td className="px-3 py-2">A</td>
                            <td className="px-3 py-2">{hostCell}</td>
                            <td className="px-3 py-2 break-all">{ip}</td>
                          </tr>
                        ));
                      }

                      const recordType = isRoot
                        ? rootIps.length > 0
                          ? 'A'
                          : 'ANAME/CNAME'
                        : 'CNAME';
                      const recordValue = isRoot
                        ? rootIps.length > 0
                          ? rootIps[0]
                          : connection.routingTarget || 'Contact support for routing target'
                        : connection.routingTarget || 'Contact support for routing target';

                      return (
                        <tr
                          key={`${connection.id}-dns`}
                          className="border-t border-white/10 text-white/80"
                        >
                          <td className="px-3 py-2">{recordType}</td>
                          <td className="px-3 py-2">{hostCell}</td>
                          <td className="px-3 py-2 break-all">{recordValue}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DNS record delete confirmation */}
      <AlertDialog
        open={deleteConfirmRecordId !== null}
        onOpenChange={(open) => { if (!open) onDeleteCancel(); }}
      >
        <AlertDialogContent className="bg-[#0a0a0f] border border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this DNS record?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              This will permanently remove the record. Traffic relying on it may stop working
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-white/20 text-white hover:bg-white/10"
              onClick={onDeleteCancel}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteConfirmRecordId !== null) onDeleteConfirm(deleteConfirmRecordId);
              }}
            >
              Delete record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
