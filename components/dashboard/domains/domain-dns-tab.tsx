'use client';

import { ClipboardCopy, Globe, HelpCircle, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DnsFormState, DnsRecordItem, DomainConnectionItem, DnsRecordType } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';

/* ─── Constants ────────────────────────────────────────────────────────────── */

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'ANAME', 'CNAME', 'TXT', 'MX', 'NS', 'SRV'];

const RECORD_TYPE_INFO: Record<string, { label: string; desc: string; example: string }> = {
  A: {
    label: 'A — IPv4 Address',
    desc: 'Points a domain to a server IPv4 address',
    example: '139.59.1.6',
  },
  AAAA: {
    label: 'AAAA — IPv6 Address',
    desc: 'Points a domain to a server IPv6 address',
    example: '2001:0db8:85a3::8a2e:0370:7334',
  },
  ANAME: {
    label: 'ANAME — Alias at root',
    desc: 'Like CNAME but works on the root domain (@)',
    example: 'myapp.galaxyhvh.com',
  },
  CNAME: {
    label: 'CNAME — Canonical Name',
    desc: 'Points a subdomain to another hostname. Cannot be used on root (@)',
    example: 'myapp.galaxyhvh.com',
  },
  TXT: {
    label: 'TXT — Text Record',
    desc: 'Used for verification, SPF, DKIM, and other metadata',
    example: 'v=spf1 include:_spf.google.com ~all',
  },
  MX: {
    label: 'MX — Mail Exchange',
    desc: 'Specifies which mail servers handle email for this domain',
    example: 'mail.example.com',
  },
  NS: {
    label: 'NS — Nameserver',
    desc: 'Delegates a subdomain to specific nameservers',
    example: 'ns1.example.com',
  },
  SRV: {
    label: 'SRV — Service Record',
    desc: 'Defines the location of specific services (e.g. SIP, XMPP)',
    example: '0 5 5269 xmpp-server.example.com',
  },
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function copyValue(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => copyValue(value, label)}
          className="ml-1.5 inline-flex items-center rounded p-0.5 text-white/30 hover:text-white/70 transition-colors"
        >
          <ClipboardCopy className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Copy</TooltipContent>
    </Tooltip>
  );
}

function RecordTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    A: 'border-cyan-500/30 text-cyan-300',
    AAAA: 'border-cyan-500/30 text-cyan-300',
    CNAME: 'border-purple-500/30 text-purple-300',
    ANAME: 'border-purple-500/30 text-purple-300',
    TXT: 'border-yellow-500/30 text-yellow-300',
    MX: 'border-orange-500/30 text-orange-300',
    NS: 'border-blue-500/30 text-blue-300',
    SRV: 'border-pink-500/30 text-pink-300',
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colorMap[type] || 'border-white/20 text-white/60'}`}>
      {type}
    </Badge>
  );
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

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

/* ─── Component ────────────────────────────────────────────────────────────── */

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
  const typeInfo = RECORD_TYPE_INFO[dnsForm.type];

  return (
    <>
      {/* ── Required records (always visible when connections exist) ── */}
      {connections.length > 0 && (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400" />
              Required DNS Records
            </CardTitle>
            <CardDescription className="text-white/55">
              {dnsManaged
                ? 'These records are managed automatically. Shown here for reference.'
                : 'Add these records at your DNS provider to complete domain setup.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verification records */}
            {connections.some((c) => (c.status === 'pending' || c.status === 'failed') && c.verificationToken) && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-yellow-300/80 flex items-center gap-1.5">
                  <Info className="h-3 w-3" />
                  Verification Records — prove you own this domain
                </p>
                <div className="overflow-x-auto rounded-lg border border-yellow-500/15 bg-yellow-500/[0.03]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 text-white/40">
                        <th className="px-3 py-2 text-left font-medium w-16">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Host / Name</th>
                        <th className="px-3 py-2 text-left font-medium">Value</th>
                        <th className="px-3 py-2 text-left font-medium w-16">TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connections
                        .filter((c) => (c.status === 'pending' || c.status === 'failed') && c.verificationToken)
                        .map((c) => (
                          <tr key={`verify-${c.id}`} className="border-t border-white/5 text-white/70">
                            <td className="px-3 py-2">
                              <RecordTypeBadge type="TXT" />
                            </td>
                            <td className="px-3 py-2 font-mono break-all">
                              galaxyhvh-verify.{c.domain}
                              <CopyBtn value={`galaxyhvh-verify.${c.domain}`} label="Host" />
                            </td>
                            <td className="px-3 py-2 font-mono break-all">
                              {c.verificationToken}
                              <CopyBtn value={c.verificationToken} label="Token" />
                            </td>
                            <td className="px-3 py-2 text-white/40">300</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Routing records */}
            {connections.some((c) => c.status === 'verified' || c.status === 'active') && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-cyan-300/80 flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  Routing Records — point traffic to your app
                </p>
                <div className="overflow-x-auto rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8 text-white/40">
                        <th className="px-3 py-2 text-left font-medium w-16">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Host / Name</th>
                        <th className="px-3 py-2 text-left font-medium">Points To</th>
                        <th className="px-3 py-2 text-left font-medium w-16">TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connections
                        .filter((c) => c.status === 'verified' || c.status === 'active')
                        .flatMap((c) => {
                          const rootIps = uniq(c.routingIps);
                          const isRoot = c.hostLabel === '@';
                          const hostDisplay = isRoot ? '@' : c.hostLabel;

                          if (isRoot && rootIps.length > 0) {
                            return rootIps.map((ip, idx) => ({
                              key: `route-${c.id}-${idx}`,
                              type: 'A' as const,
                              host: hostDisplay,
                              hostNote: domainName,
                              value: ip,
                              note: c.appName,
                            }));
                          }

                          return [{
                            key: `route-${c.id}`,
                            type: isRoot ? (rootIps.length > 0 ? 'A' as const : 'ANAME' as const) : 'CNAME' as const,
                            host: hostDisplay,
                            hostNote: isRoot ? domainName : `${c.hostLabel}.${domainName}`,
                            value: isRoot
                              ? (rootIps[0] || c.routingTarget || 'Pending…')
                              : (c.routingTarget || 'Pending…'),
                            note: c.appName,
                          }];
                        })
                        .map((row) => (
                          <tr key={row.key} className="border-t border-white/5 text-white/70">
                            <td className="px-3 py-2">
                              <RecordTypeBadge type={row.type} />
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {row.host}
                              <span className="text-white/25 ml-1.5 text-[10px] hidden sm:inline">({row.hostNote})</span>
                            </td>
                            <td className="px-3 py-2 font-mono break-all">
                              {row.value}
                              {row.value !== 'Pending…' && (
                                <CopyBtn value={row.value} label="Value" />
                              )}
                              <span className="text-white/25 ml-1.5 text-[10px] hidden sm:inline">({row.note})</span>
                            </td>
                            <td className="px-3 py-2 text-white/40">300</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-white/35 flex items-center gap-1">
                  <Info className="h-3 w-3 shrink-0" />
                  Root domains (@) use A records with IP addresses. Subdomains use CNAME records pointing to your app hostname.
                </p>
              </div>
            )}

            {/* No active connections */}
            {!connections.some(
              (c) =>
                c.status === 'verified' ||
                c.status === 'active' ||
                ((c.status === 'pending' || c.status === 'failed') && c.verificationToken),
            ) && (
              <p className="text-xs text-white/40 py-2">
                All connections are fully set up. No pending DNS records needed.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Managed DNS zone editor ── */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">DNS Records</CardTitle>
          <CardDescription className="text-white/55">
            {dnsManaged
              ? 'Full control of the DNS zone — add, edit, or remove any record type.'
              : connections.length > 0
                ? 'This domain uses external DNS. Use the Required Records section above to configure your provider.'
                : 'Connect this domain to an app first to see DNS setup guidance.'}
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
            <div className="flex items-center gap-2 text-sm text-white/60 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading DNS records…
            </div>
          ) : dnsManaged ? (
            <div className="space-y-4">
              {dnsZone && dnsZone !== domainName && (
                <p className="text-xs text-white/50">
                  Zone: <span className="font-mono text-white/70">{dnsZone}</span>
                </p>
              )}

              {/* Add / Edit form */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">
                    {dnsForm.recordId ? 'Edit Record' : 'Add New Record'}
                  </p>
                  {typeInfo && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-white/30 hover:text-white/60">
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
                        <p className="font-medium">{typeInfo.label}</p>
                        <p className="text-white/60">{typeInfo.desc}</p>
                        <p className="font-mono text-white/40">Example: {typeInfo.example}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-1.5">
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
                    <p className="text-[10px] text-white/30">{RECORD_TYPE_INFO[dnsForm.type]?.desc}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/60">Host</Label>
                    <Input
                      value={dnsForm.host}
                      onChange={(e) => onFormChange({ host: e.target.value })}
                      placeholder="@ for root, or subdomain"
                      className="bg-black/30 border-white/10 font-mono text-sm"
                    />
                    <p className="text-[10px] text-white/30">@ = {domainName}</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-white/60">Value</Label>
                    <Input
                      value={dnsForm.answer}
                      onChange={(e) => onFormChange({ answer: e.target.value })}
                      placeholder={typeInfo?.example || 'Target IP, hostname, or text'}
                      className="bg-black/30 border-white/10 font-mono text-sm"
                    />
                    <p className="text-[10px] text-white/30">
                      {dnsForm.type === 'A' && 'IPv4 address, e.g. 139.59.1.6'}
                      {dnsForm.type === 'AAAA' && 'IPv6 address'}
                      {dnsForm.type === 'CNAME' && 'Target hostname, e.g. myapp.galaxyhvh.com'}
                      {dnsForm.type === 'ANAME' && 'Target hostname — works on root domain'}
                      {dnsForm.type === 'TXT' && 'Text value — SPF, DKIM, verification, etc.'}
                      {dnsForm.type === 'MX' && 'Mail server hostname'}
                      {dnsForm.type === 'NS' && 'Nameserver hostname'}
                      {dnsForm.type === 'SRV' && 'weight port target (e.g. 0 5 5269 xmpp.example.com)'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/60">TTL</Label>
                    <Input
                      type="number"
                      value={dnsForm.ttl}
                      onChange={(e) =>
                        onFormChange({ ttl: Number(e.target.value || 300) })
                      }
                      className="bg-black/30 border-white/10 text-sm"
                    />
                    <p className="text-[10px] text-white/30">Seconds (300 = 5 min)</p>
                  </div>
                </div>
                {needsPriority && (
                  <div className="space-y-1.5 max-w-xs">
                    <Label className="text-xs text-white/60">Priority</Label>
                    <Input
                      type="number"
                      value={dnsForm.priority}
                      onChange={(e) => onFormChange({ priority: e.target.value })}
                      placeholder="10"
                      className="bg-black/30 border-white/10 text-sm"
                    />
                    <p className="text-[10px] text-white/30">Lower number = higher priority (0 – 65535)</p>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  {dnsForm.recordId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={onCancelEdit}
                    >
                      Cancel
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

              {/* Existing records table */}
              {dnsRecords.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-8 text-center">
                  <Globe className="h-8 w-8 mx-auto text-white/15 mb-3" />
                  <p className="text-sm text-white/50 mb-1">No DNS records yet</p>
                  <p className="text-xs text-white/30">Use the form above to add your first record.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-white/50 text-xs">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium w-20">Type</th>
                        <th className="px-3 py-2.5 text-left font-medium">Host</th>
                        <th className="px-3 py-2.5 text-left font-medium">Value</th>
                        <th className="px-3 py-2.5 text-left font-medium w-16">TTL</th>
                        <th className="px-3 py-2.5 text-left font-medium w-20">Priority</th>
                        <th className="px-3 py-2.5 text-left font-medium w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dnsRecords.map((record) => (
                        <tr
                          key={`${record.id ?? record.host}:${record.type}:${record.answer}`}
                          className="border-t border-white/8 text-white/75 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <RecordTypeBadge type={record.type} />
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            {record.host}
                            <CopyBtn value={record.host} label="Host" />
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs break-all max-w-[300px]">
                            <span className="inline-block truncate max-w-full">{record.answer}</span>
                            <CopyBtn value={record.answer} label="Value" />
                          </td>
                          <td className="px-3 py-2.5 text-xs text-white/50">{record.ttl}</td>
                          <td className="px-3 py-2.5 text-xs text-white/50">{record.priority ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[11px] border-white/15 text-white/60 hover:bg-white/10 hover:text-white"
                                onClick={() => onEditRecord(record)}
                              >
                                Edit
                              </Button>
                              {record.id !== null && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] border-red-500/20 text-red-300/60 hover:bg-red-500/10 hover:text-red-200"
                                  disabled={dnsDeletingRecordId === record.id}
                                  onClick={() => onDeleteRequest(record.id as number)}
                                >
                                  {dnsDeletingRecordId === record.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
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
            <div className="rounded-lg border border-dashed border-white/15 p-8 text-center">
              <Globe className="h-8 w-8 mx-auto text-white/15 mb-3" />
              <p className="text-sm text-white/50 mb-1">No domain connected yet</p>
              <p className="text-xs text-white/30">Go to the Connections tab to connect this domain to an app first.</p>
            </div>
          ) : (
            <div className="text-xs text-white/40 py-2 flex items-center gap-1.5">
              <Info className="h-3 w-3 shrink-0" />
              This domain uses an external DNS provider.
              Use the Required Records section above to see exactly what to add.
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
