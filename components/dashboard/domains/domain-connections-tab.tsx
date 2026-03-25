'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Circle,
  ClipboardCopy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
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
import { DomainAttachAction, type DomainAppOption } from './domain-attach-action';
import type { DomainConnection, DomainConnectionItem } from './domain-detail-types';
import { sanitizeLastError } from './domain-detail-types';
import { SslStatusBadge } from '@/components/ui/ssl-status-badge';

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
          className="ml-1 inline-flex items-center rounded p-0.5 text-white/40 hover:text-white/80 transition-colors"
        >
          <ClipboardCopy className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Copy</TooltipContent>
    </Tooltip>
  );
}

type StepPhase = 'done' | 'current' | 'upcoming';

function stepPhaseForConnection(conn: DomainConnectionItem): { verify: StepPhase; activate: StepPhase; ssl: StepPhase } {
  if (conn.status === 'active' && conn.sslStatus === 'active') {
    return { verify: 'done', activate: 'done', ssl: 'done' };
  }
  if (conn.status === 'active') {
    return { verify: 'done', activate: 'done', ssl: 'current' };
  }
  if (conn.status === 'verified') {
    return { verify: 'done', activate: 'current', ssl: 'upcoming' };
  }
  return { verify: 'current', activate: 'upcoming', ssl: 'upcoming' };
}

function StepIndicator({ phase, num, label }: { phase: StepPhase; num: number; label: string }) {
  const icon =
    phase === 'done' ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
    ) : phase === 'current' ? (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-white">
        {num}
      </div>
    ) : (
      <Circle className="h-5 w-5 text-white/20" />
    );

  return (
    <div className="flex items-center gap-2">
      {icon}
      <span
        className={
          phase === 'done'
            ? 'text-xs text-emerald-300'
            : phase === 'current'
              ? 'text-xs font-medium text-cyan-200'
              : 'text-xs text-white/30'
        }
      >
        {label}
      </span>
    </div>
  );
}

function statusBadge(status: DomainConnection['status']) {
  switch (status) {
    case 'active':
      return <Badge className="border-green-500/30 bg-green-500/20 text-green-200">Active</Badge>;
    case 'verified':
      return <Badge className="border-cyan-500/30 bg-cyan-500/20 text-cyan-200">Verified</Badge>;
    case 'pending':
      return <Badge className="border-yellow-500/30 bg-yellow-500/20 text-yellow-100">Pending</Badge>;
    case 'failed':
      return <Badge className="border-red-500/30 bg-red-500/20 text-red-200">Failed</Badge>;
    default:
      return <Badge className="border-white/20 bg-white/10 text-white/80">Unknown</Badge>;
  }
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface DomainConnectionsTabProps {
  domainName: string;
  connections: DomainConnectionItem[];
  loading: boolean;
  appOptions: DomainAppOption[];
  subdomainInput: string;
  attachDomain: string;
  removeConfirmConnectionId: string | null;
  verifyingConnectionId: string | null;
  activatingConnectionId: string | null;
  settingPrimaryConnectionId: string | null;
  removingConnectionId: string | null;
  checkingSslId: string | null;
  onSubdomainChange: (value: string) => void;
  onAttached: () => void;
  onVerify: (id: string) => void;
  onActivate: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onRemoveRequest: (id: string) => void;
  onRemoveConfirm: (id: string) => void;
  onRemoveCancel: () => void;
  onCheckSsl: (id: string) => void;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export function DomainConnectionsTab({
  domainName,
  connections,
  loading,
  appOptions,
  subdomainInput,
  attachDomain,
  removeConfirmConnectionId,
  verifyingConnectionId,
  activatingConnectionId,
  settingPrimaryConnectionId,
  removingConnectionId,
  checkingSslId,
  onSubdomainChange,
  onAttached,
  onVerify,
  onActivate,
  onSetPrimary,
  onRemoveRequest,
  onRemoveConfirm,
  onRemoveCancel,
  onCheckSsl,
}: DomainConnectionsTabProps) {
  const confirmConn = removeConfirmConnectionId
    ? connections.find((c) => c.id === removeConfirmConnectionId)
    : null;

  const [showGuide, setShowGuide] = useState(true);
  const guidePinned = useRef(false);
  useEffect(() => {
    if (!loading && !guidePinned.current) {
      guidePinned.current = true;
      if (connections.length > 0) setShowGuide(false);
    }
  }, [loading, connections.length]);

  return (
    <>
      {/* ── Setup guide ── */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-2">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setShowGuide((v) => !v)}
          >
            <div>
              <CardTitle className="text-base text-left">How to Connect a Domain</CardTitle>
              <CardDescription className="text-white/55 mt-0.5 text-left">
                Three steps to point your domain to your app
              </CardDescription>
            </div>
            <span className="text-xs text-white/40">{showGuide ? 'Hide' : 'Show'}</span>
          </button>
        </CardHeader>
        {showGuide && (
          <CardContent className="pt-0">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Step 1 */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-300">
                    1
                  </div>
                  <span className="text-sm font-medium text-white">Add &amp; Verify</span>
                </div>
                <p className="text-xs text-white/55 leading-relaxed">
                  Connect a domain or subdomain to an app below. Then add a <strong className="text-white/80">TXT</strong> record
                  at your DNS provider to prove ownership and click <strong className="text-white/80">Verify</strong>.
                </p>
                <div className="rounded border border-white/8 bg-black/30 p-2 text-[11px] font-mono text-white/50 space-y-1">
                  <p><span className="text-white/70">Type:</span> TXT</p>
                  <p><span className="text-white/70">Name:</span> galaxyhvh-verify.<em className="text-white/60 not-italic">&lt;connected domain&gt;</em></p>
                  <p><span className="text-white/70">Value:</span> <span className="italic">(shown after connecting)</span></p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-300">
                    2
                  </div>
                  <span className="text-sm font-medium text-white">Activate</span>
                </div>
                <p className="text-xs text-white/55 leading-relaxed">
                  Once verified, click <strong className="text-white/80">Activate</strong>. This sets up routing and begins issuing
                  your SSL certificate. You&apos;ll need to add a <strong className="text-white/80">CNAME</strong> (subdomains)
                  or <strong className="text-white/80">A</strong> record (apex) at your DNS provider.
                </p>
                <div className="rounded border border-white/8 bg-black/30 p-2 text-[11px] font-mono text-white/50 space-y-1">
                  <p><span className="text-white/70">Subdomain:</span> CNAME → app-name.galaxyhvh.com</p>
                  <p><span className="text-white/70">Root (@):</span> A → 139.59.1.6</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
                    3
                  </div>
                  <span className="text-sm font-medium text-white">SSL Active</span>
                </div>
                <p className="text-xs text-white/55 leading-relaxed">
                  Once DNS propagates, a free <strong className="text-white/80">Let&apos;s Encrypt</strong> certificate is automatically
                  issued. Your domain is live with HTTPS. Use <strong className="text-white/80">Check SSL</strong> to see current
                  status.
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-400/60">
                  <Lock className="h-3 w-3" />
                  <span>Automatic HTTPS — no extra configuration</span>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Connect domain to app ── */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connect Domain</CardTitle>
          <CardDescription className="text-white/55">
            Attach <span className="font-mono text-white/70">{domainName}</span> or a subdomain to one of your apps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 rounded-lg border border-white/10 bg-black/20 p-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="subdomain-input" className="text-xs text-white/70">
                Subdomain <span className="text-white/40">(optional)</span>
              </Label>
              <Input
                id="subdomain-input"
                placeholder="e.g. api, www, blog"
                value={subdomainInput}
                onChange={(e) => onSubdomainChange(e.target.value)}
                className="bg-black/30 border-white/10 font-mono text-sm"
              />
              <p className="text-[11px] text-white/40">Leave empty for root domain</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-white/70">Select app &amp; add connection</Label>
              <DomainAttachAction
                domain={attachDomain}
                appOptions={appOptions}
                buttonLabel="Add Connection"
                onAttached={onAttached}
              />
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <Globe className="h-3 w-3 shrink-0" />
                <span>Will connect <span className="font-mono text-white/60">{attachDomain}</span></span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Connections list ── */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Connections
            {connections.length > 0 && (
              <span className="ml-2 text-sm font-normal text-white/40">({connections.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-white/60 py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading connections…
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-8 text-center">
              <Globe className="h-8 w-8 mx-auto text-white/20 mb-3" />
              <p className="text-sm text-white/55 mb-1">No connections yet</p>
              <p className="text-xs text-white/35">Use the form above to connect a domain to your app.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((connection) => {
                const phases = stepPhaseForConnection(connection);
                const isRoot = connection.hostLabel === '@';
                const routingIps = [...new Set(connection.routingIps.filter(Boolean))];

                return (
                  <div
                    key={connection.id}
                    className="rounded-lg border border-white/10 bg-black/20 overflow-hidden"
                  >
                    {/* Header row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{connection.domain}</p>
                        {statusBadge(connection.status)}
                        {connection.isPrimary && (
                          <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-200 text-[10px]">
                            <Star className="h-2.5 w-2.5 mr-0.5" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(connection.status === 'pending' || connection.status === 'failed') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-white/20 text-white hover:bg-white/10 text-xs"
                            disabled={verifyingConnectionId === connection.id}
                            onClick={() => onVerify(connection.id)}
                          >
                            {verifyingConnectionId === connection.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Verify
                              </>
                            )}
                          </Button>
                        )}
                        {connection.status === 'verified' && (
                          <Button
                            size="sm"
                            className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                            disabled={
                              activatingConnectionId === connection.id ||
                              connection.appStatus !== 'running'
                            }
                            onClick={() => onActivate(connection.id)}
                            title={
                              connection.appStatus !== 'running'
                                ? 'Your app must be running before you can activate this domain.'
                                : undefined
                            }
                          >
                            {activatingConnectionId === connection.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Activate
                              </>
                            )}
                          </Button>
                        )}
                        {connection.status === 'active' && !connection.isPrimary && connection.sslStatus !== 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-white/20 text-white hover:bg-white/10 text-xs"
                            disabled={settingPrimaryConnectionId === connection.id}
                            onClick={() => onSetPrimary(connection.id)}
                          >
                            {settingPrimaryConnectionId === connection.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </>
                            )}
                          </Button>
                        )}
                        {connection.status === 'active' && connection.sslStatus === 'failed' && (
                          <Button
                            size="sm"
                            className="h-7 bg-orange-600 hover:bg-orange-700 text-white text-xs"
                            disabled={
                              activatingConnectionId === connection.id ||
                              connection.appStatus !== 'running'
                            }
                            onClick={() => onActivate(connection.id)}
                            title="Re-activate to retry secure-connection setup"
                          >
                            {activatingConnectionId === connection.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Re-Activate
                              </>
                            )}
                          </Button>
                        )}
                        <Link href={`/dashboard/services/apps/${connection.appId}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-white/20 text-white hover:bg-white/10 text-xs"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            App
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-red-500/30 text-red-300 hover:bg-red-500/10"
                          disabled={removingConnectionId === connection.id}
                          onClick={() => onRemoveRequest(connection.id)}
                        >
                          {removingConnectionId === connection.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3 space-y-3">
                      {/* Progress steps */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <StepIndicator phase={phases.verify} num={1} label="Verify Ownership" />
                        <span className="text-white/10 hidden sm:inline">→</span>
                        <StepIndicator phase={phases.activate} num={2} label="Activate Routing" />
                        <span className="text-white/10 hidden sm:inline">→</span>
                        <StepIndicator phase={phases.ssl} num={3} label="SSL Certificate" />
                      </div>

                      {/* Info row */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/50">
                        <span>
                          <span className="text-white/35">Host:</span>{' '}
                          <span className="font-mono text-white/65">
                            {isRoot ? `${domainName} (root)` : connection.hostLabel}
                          </span>
                        </span>
                        <span>
                          <span className="text-white/35">App:</span>{' '}
                          <span className="text-white/65">{connection.appName}</span>
                          <span className="text-white/30 ml-1">({connection.appStatus})</span>
                        </span>
                      </div>

                      {/* SSL Status */}
                      <SslStatusBadge
                        sslStatus={connection.sslStatus}
                        id={connection.id}
                        onCheck={connection.status === 'active' ? onCheckSsl : undefined}
                        checkingId={checkingSslId}
                        variant="row"
                        dnsMessage={
                          connection.dnsReady === false ? connection.dnsMessage : undefined
                        }
                      />

                      {/* Verification instructions */}
                      {(connection.status === 'pending' || connection.status === 'failed') &&
                        connection.verificationToken && (
                          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-yellow-200 flex items-center gap-1.5">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Step 1: Add this TXT record to verify ownership
                            </p>
                            <div className="overflow-x-auto rounded border border-white/8 bg-black/30">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-white/8 text-white/40">
                                    <th className="px-3 py-1.5 text-left font-medium w-16">Type</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Name / Host</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-white/70">
                                    <td className="px-3 py-1.5">
                                      <Badge variant="outline" className="border-yellow-500/30 text-yellow-200 text-[10px]">TXT</Badge>
                                    </td>
                                    <td className="px-3 py-1.5 font-mono break-all">
                                      galaxyhvh-verify.{connection.domain}
                                      <CopyBtn value={`galaxyhvh-verify.${connection.domain}`} label="Record name" />
                                    </td>
                                    <td className="px-3 py-1.5 font-mono break-all">
                                      {connection.verificationToken}
                                      <CopyBtn value={connection.verificationToken} label="Verification token" />
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="text-[11px] text-yellow-100/50">
                              After adding this record, wait 1–5 minutes for DNS propagation, then click Verify above.
                            </p>
                          </div>
                        )}

                      {/* Routing instructions — show when verified (needs to be set up) or active with routing info */}
                      {(connection.status === 'verified' || connection.status === 'active') &&
                        (connection.routingTarget || routingIps.length > 0) && (
                          <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3 space-y-2">
                            <p className="text-xs font-medium text-cyan-200 flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5" />
                              {connection.status === 'verified' ? 'Step 2: Add this DNS record to route traffic' : 'DNS routing records'}
                            </p>
                            <div className="overflow-x-auto rounded border border-white/8 bg-black/30">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-white/8 text-white/40">
                                    <th className="px-3 py-1.5 text-left font-medium w-16">Type</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Name / Host</th>
                                    <th className="px-3 py-1.5 text-left font-medium">Value / Points to</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {isRoot && routingIps.length > 0 ? (
                                    routingIps.map((ip) => (
                                      <tr key={ip} className="text-white/70 border-t border-white/5 first:border-t-0">
                                        <td className="px-3 py-1.5">
                                          <Badge variant="outline" className="border-cyan-500/30 text-cyan-200 text-[10px]">A</Badge>
                                        </td>
                                        <td className="px-3 py-1.5 font-mono">
                                          @
                                          <span className="text-white/30 ml-1.5">({domainName})</span>
                                        </td>
                                        <td className="px-3 py-1.5 font-mono">
                                          {ip}
                                          <CopyBtn value={ip} label="IP address" />
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr className="text-white/70">
                                      <td className="px-3 py-1.5">
                                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-200 text-[10px]">
                                          {isRoot ? (routingIps.length > 0 ? 'A' : 'ANAME') : 'CNAME'}
                                        </Badge>
                                      </td>
                                      <td className="px-3 py-1.5 font-mono">
                                        {isRoot ? '@' : connection.hostLabel}
                                        {isRoot && <span className="text-white/30 ml-1.5">({domainName})</span>}
                                      </td>
                                      <td className="px-3 py-1.5 font-mono break-all">
                                        {connection.routingTarget || 'Pending…'}
                                        {connection.routingTarget && (
                                          <CopyBtn
                                            value={connection.routingTarget}
                                            label="Routing value"
                                          />
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {connection.status === 'verified' && (
                              <p className="text-[11px] text-cyan-200/40">
                                Add this record at your DNS provider, then click Activate above. SSL will be issued automatically.
                              </p>
                            )}
                          </div>
                        )}

                      {/* Error */}
                      {connection.lastError && (
                        <p className="text-xs text-red-300 bg-red-500/5 border border-red-500/15 rounded px-3 py-2">
                          {sanitizeLastError(connection.lastError)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect confirmation */}
      <AlertDialog
        open={removeConfirmConnectionId !== null}
        onOpenChange={(open) => { if (!open) onRemoveCancel(); }}
      >
        <AlertDialogContent className="bg-[#0a0a0f] border border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this domain?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              {confirmConn?.domain ? (
                <>
                  <strong className="text-white">{confirmConn.domain}</strong> will be disconnected
                  from <strong className="text-white">{confirmConn.appName}</strong>.{' '}
                </>
              ) : (
                'This domain will be disconnected from this app. '
              )}
              Your domain stays in your account — you can reconnect it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-white/20 text-white hover:bg-white/10"
              onClick={onRemoveCancel}
            >
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (removeConfirmConnectionId) onRemoveConfirm(removeConfirmConnectionId);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
