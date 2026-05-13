'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, Globe, HelpCircle, Info, Loader2, Plus, X } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DnsFormState, DnsRecordItem, DomainConnectionItem, DnsRecordType } from './domain-detail-types';
import { looksInternal } from './domain-detail-types';

/* ─── Constants ────────────────────────────────────────────────────────────── */

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'ANAME', 'CNAME', 'TXT', 'MX', 'NS', 'SRV'];

const RECORD_TYPE_INFO: Record<string, { desc: string; example: string }> = {
  A:    { desc: 'Points a domain to a server IPv4 address', example: '139.59.1.6' },
  AAAA: { desc: 'Points a domain to a server IPv6 address', example: '2001:0db8:85a3::8a2e:0370:7334' },
  ANAME:{ desc: 'Like CNAME but works on the root domain (@)', example: 'myapp.galaxyhvh.com' },
  CNAME:{ desc: 'Points a subdomain to another hostname. Cannot be used on root (@)', example: 'myapp.galaxyhvh.com' },
  TXT:  { desc: 'Used for verification, SPF, DKIM, and other metadata', example: 'v=spf1 include:_spf.google.com ~all' },
  MX:   { desc: 'Specifies which mail servers handle email for this domain', example: 'mail.example.com' },
  NS:   { desc: 'Delegates a subdomain to specific nameservers', example: 'ns1.example.com' },
  SRV:  { desc: 'Defines the location of specific services. Value format: weight port target (priority set separately)', example: '0 5269 xmpp-server.example.com' },
};

const TYPE_COLORS: Record<string, string> = {
  A:    'text-cyan-300 border-cyan-500/25 bg-cyan-500/10',
  AAAA: 'text-cyan-300 border-cyan-500/25 bg-cyan-500/10',
  CNAME:'text-purple-300 border-purple-500/25 bg-purple-500/10',
  ANAME:'text-purple-300 border-purple-500/25 bg-purple-500/10',
  TXT:  'text-amber-300 border-amber-500/25 bg-amber-500/10',
  MX:   'text-orange-300 border-orange-500/25 bg-orange-500/10',
  NS:   'text-blue-300 border-blue-500/25 bg-blue-500/10',
  SRV:  'text-pink-300 border-pink-500/25 bg-pink-500/10',
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function RecordTypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] || 'text-white/60 border-white/20 bg-white/10';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold font-mono ${color}`}>
      {type}
    </span>
  );
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-1.5 inline-flex items-center rounded p-0.5 text-white/25 hover:text-white/60 transition-colors"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{copied ? 'Copied!' : 'Copy'}</TooltipContent>
    </Tooltip>
  );
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

  // Filter records by type
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const presentTypes = Array.from(new Set(dnsRecords.map((r) => r.type)));
  const filteredRecords = typeFilter ? dnsRecords.filter((r) => r.type === typeFilter) : dnsRecords;

  return (
    <>
      {/* ── Required records ── */}
      {connections.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Globe className="h-4 w-4 text-white/40" />
            <p className="text-sm font-medium text-white">Required DNS Records</p>
            {dnsManaged && (
              <span className="ml-auto text-xs text-white/35">Managed automatically</span>
            )}
          </div>
          <div className="p-4 space-y-4">
            {/* Verification records */}
            {connections.some((c) => (c.status === 'pending' || c.status === 'failed') && c.verificationToken) && (
              <div>
                <p className="text-xs font-medium text-amber-300/80 mb-2 flex items-center gap-1.5">
                  <Info className="h-3 w-3" />
                  Verification — prove ownership of this domain
                </p>
                <div className="overflow-x-auto rounded-lg border border-amber-500/15 bg-amber-500/[0.03]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/30">
                        <th className="px-3 py-2 text-left w-16">Type</th>
                        <th className="px-3 py-2 text-left">Host / Name</th>
                        <th className="px-3 py-2 text-left">Value</th>
                        <th className="px-3 py-2 text-left w-14">TTL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connections
                        .filter((c) => (c.status === 'pending' || c.status === 'failed') && c.verificationToken)
                        .map((c) => (
                          <tr key={`verify-${c.id}`} className="border-t border-white/[0.04] text-white/70">
                            <td className="px-3 py-2"><RecordTypeBadge type="TXT" /></td>
                            <td className="px-3 py-2 font-mono break-all">
                              galaxyhvh-verify.{c.domain}
                              <CopyBtn value={`galaxyhvh-verify.${c.domain}`} label="Host" />
                            </td>
                            <td className="px-3 py-2 font-mono break-all max-w-[200px]">
                              <span className="truncate block">{c.verificationToken}</span>
                              <CopyBtn value={c.verificationToken} label="Token" />
                            </td>
                            <td className="px-3 py-2 text-white/35">300</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Routing records */}
            {connections.some((c) => c.status === 'verified' || c.status === 'active') && (
              <div>
                <p className="text-xs font-medium text-cyan-300/80 mb-2 flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  Routing — point traffic to your app
                </p>
                <div className="overflow-x-auto rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/30">
                        <th className="px-3 py-2 text-left w-16">Type</th>
                        <th className="px-3 py-2 text-left">Host / Name</th>
                        <th className="px-3 py-2 text-left">Points To</th>
                        <th className="px-3 py-2 text-left w-14">TTL</th>
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
                          <tr key={row.key} className="border-t border-white/[0.04] text-white/70">
                            <td className="px-3 py-2"><RecordTypeBadge type={row.type} /></td>
                            <td className="px-3 py-2 font-mono">
                              {row.host}
                              <span className="text-white/25 ml-1.5 text-[10px] hidden sm:inline">({row.hostNote})</span>
                            </td>
                            <td className="px-3 py-2 font-mono break-all">
                              {row.value}
                              {row.value !== 'Pending…' && <CopyBtn value={row.value} label="Value" />}
                              <span className="text-white/25 ml-1.5 text-[10px] hidden sm:inline">({row.note})</span>
                            </td>
                            <td className="px-3 py-2 text-white/35">300</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-white/30 flex items-center gap-1">
                  <Info className="h-3 w-3 shrink-0" />
                  Root domains use A records with IP. Subdomains use CNAME pointing to your app hostname.
                </p>
              </div>
            )}

            {!connections.some(
              (c) =>
                c.status === 'verified' ||
                c.status === 'active' ||
                ((c.status === 'pending' || c.status === 'failed') && c.verificationToken),
            ) && (
              <p className="text-xs text-white/35 py-1">
                All connections are fully set up. No pending DNS records needed.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Managed DNS zone editor ── */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-medium text-white">DNS Records</p>
          <p className="mt-0.5 text-xs text-white/40">
            {dnsManaged
              ? 'Full control over the DNS zone — add, edit, or remove any record.'
              : connections.length > 0
                ? 'This domain uses external DNS. See Required Records above for configuration.'
                : 'Connect this domain to an app first to see DNS guidance.'}
          </p>
        </div>

        <div className="p-4 space-y-5">
          {dnsError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-xs text-red-200">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {looksInternal(dnsError) ? 'Unable to load DNS records. Refresh to try again.' : dnsError}
            </div>
          )}

          {dnsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading DNS records…
            </div>
          ) : dnsManaged ? (
            <>
              {dnsZone && dnsZone !== domainName && (
                <p className="text-xs text-white/40">
                  Zone: <span className="font-mono text-white/60">{dnsZone}</span>
                </p>
              )}

              {/* Add / Edit form */}
              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">
                    {dnsForm.recordId ? 'Edit Record' : 'Add Record'}
                  </p>
                  <div className="flex items-center gap-2">
                    {typeInfo && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-white/30 hover:text-white/60 transition-colors">
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs text-xs space-y-1 p-3">
                          <p className="font-medium text-white">{dnsForm.type} record</p>
                          <p className="text-white/60">{typeInfo.desc}</p>
                          <p className="font-mono text-white/40 text-[10px]">Example: {typeInfo.example}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {dnsForm.recordId && (
                      <button
                        type="button"
                        onClick={onCancelEdit}
                        className="text-white/30 hover:text-white/60 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Form grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[120px_1fr_1fr_100px]">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50">Type</Label>
                    <select
                      value={dnsForm.type}
                      onChange={(e) => onFormChange({ type: e.target.value as DnsRecordType })}
                      className="h-9 w-full rounded-md border border-white/[0.08] bg-black/40 px-2.5 text-sm text-white focus:border-white/[0.2] focus:outline-none"
                    >
                      {DNS_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50">Host</Label>
                    <Input
                      value={dnsForm.host}
                      onChange={(e) => onFormChange({ host: e.target.value })}
                      placeholder="@ for root, or subdomain"
                      className="h-9 bg-black/40 border-white/[0.08] font-mono text-sm focus:border-white/[0.2]"
                    />
                    <p className="text-[10px] text-white/30">@ = {domainName}</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs text-white/50">Value</Label>
                    <Input
                      value={dnsForm.answer}
                      onChange={(e) => onFormChange({ answer: e.target.value })}
                      placeholder={typeInfo?.example || 'Target IP, hostname, or text'}
                      className="h-9 bg-black/40 border-white/[0.08] font-mono text-sm focus:border-white/[0.2]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/50">TTL (s)</Label>
                    <Input
                      type="number"
                      value={dnsForm.ttl}
                      onChange={(e) => onFormChange({ ttl: Number(e.target.value || 300) })}
                      className="h-9 bg-black/40 border-white/[0.08] text-sm focus:border-white/[0.2]"
                    />
                  </div>
                </div>

                {needsPriority && (
                  <div className="space-y-1.5 max-w-[160px]">
                    <Label className="text-xs text-white/50">Priority</Label>
                    <Input
                      type="number"
                      value={dnsForm.priority}
                      onChange={(e) => onFormChange({ priority: e.target.value })}
                      placeholder="10"
                      className="h-9 bg-black/40 border-white/[0.08] text-sm focus:border-white/[0.2]"
                    />
                    <p className="text-[10px] text-white/30">Lower = higher priority</p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/[0.06]">
                  {dnsForm.recordId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-white/50 hover:text-white hover:bg-white/[0.06]"
                      onClick={onCancelEdit}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="bg-white text-black hover:bg-white/90 font-medium"
                    disabled={dnsSaving}
                    onClick={onSaveRecord}
                  >
                    {dnsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {dnsForm.recordId ? 'Update Record' : 'Add Record'}
                  </Button>
                </div>
              </div>

              {/* Records table */}
              {dnsRecords.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] p-8 text-center">
                  <Globe className="h-7 w-7 mx-auto text-white/15 mb-3" />
                  <p className="text-sm text-white/45 mb-1">No DNS records yet</p>
                  <p className="text-xs text-white/30">Use the form above to add your first record.</p>
                </div>
              ) : (
                <div>
                  {/* Type filter pills */}
                  {presentTypes.length > 1 && (
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setTypeFilter(null)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          typeFilter === null
                            ? 'bg-white/10 border-white/20 text-white'
                            : 'border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15'
                        }`}
                      >
                        All ({dnsRecords.length})
                      </button>
                      {presentTypes.map((t) => {
                        const color = TYPE_COLORS[t] || 'text-white/60 border-white/20 bg-white/10';
                        const count = dnsRecords.filter((r) => r.type === t).length;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors font-mono ${
                              typeFilter === t ? color : 'border-white/[0.08] text-white/40 hover:text-white/60'
                            }`}
                          >
                            {t} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] font-medium uppercase tracking-wider text-white/30 border-b border-white/[0.06] bg-white/[0.02]">
                          <th className="px-3 py-2.5 text-left w-20">Type</th>
                          <th className="px-3 py-2.5 text-left">Host</th>
                          <th className="px-3 py-2.5 text-left">Value</th>
                          <th className="px-3 py-2.5 text-left w-14">TTL</th>
                          <th className="px-3 py-2.5 text-left w-16 hidden sm:table-cell">Priority</th>
                          <th className="px-3 py-2.5 text-left w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.map((record) => (
                          <tr
                            key={`${record.id ?? record.host}:${record.type}:${record.answer}`}
                            className="border-t border-white/[0.04] text-white/70 hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-3 py-2.5">
                              <RecordTypeBadge type={record.type} />
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs">
                              {record.host}
                              <CopyBtn value={record.host} label="Host" />
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs max-w-[260px]">
                              <span className="block truncate">{record.answer}</span>
                              <CopyBtn value={record.answer} label="Value" />
                            </td>
                            <td className="px-3 py-2.5 text-xs text-white/40 tabular-nums">{record.ttl}</td>
                            <td className="px-3 py-2.5 text-xs text-white/40 tabular-nums hidden sm:table-cell">
                              {record.priority ?? '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px] text-white/40 hover:text-white hover:bg-white/[0.06]"
                                  onClick={() => onEditRecord(record)}
                                >
                                  Edit
                                </Button>
                                {record.id !== null && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[11px] text-red-400/50 hover:text-red-300 hover:bg-red-500/[0.06]"
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
                </div>
              )}
            </>
          ) : connections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/[0.08] p-8 text-center">
              <Globe className="h-7 w-7 mx-auto text-white/15 mb-3" />
              <p className="text-sm text-white/45 mb-1">No domain connected yet</p>
              <p className="text-xs text-white/30">Go to the Connections tab to connect this domain to an app first.</p>
            </div>
          ) : (
            <div className="text-xs text-white/40 flex items-center gap-1.5 py-1">
              <Info className="h-3.5 w-3.5 shrink-0" />
              This domain uses an external DNS provider. See the Required Records section above.
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteConfirmRecordId !== null}
        onOpenChange={(open) => { if (!open) onDeleteCancel(); }}
      >
        <AlertDialogContent className="bg-[#0d0d0d] border border-white/[0.08] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this DNS record?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This will permanently remove the record. Traffic relying on it may stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-white/[0.12] text-white/70 hover:bg-white/[0.06] hover:text-white"
              onClick={onDeleteCancel}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white border-0"
              onClick={() => { if (deleteConfirmRecordId !== null) onDeleteConfirm(deleteConfirmRecordId); }}
            >
              Delete record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
