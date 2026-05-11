'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  XCircle,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DomainAttachAction, type DomainAppOption } from './domain-attach-action';
import type { DomainConnection, DomainConnectionItem } from './domain-detail-types';
import { sanitizeLastError } from './domain-detail-types';
import { SslStatusBadge } from '@/components/ui/ssl-status-badge';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

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

type StepPhase = 'done' | 'current' | 'upcoming' | 'error';

function stepPhaseForConnection(conn: DomainConnectionItem): { verify: StepPhase; activate: StepPhase; ssl: StepPhase } {
  if (conn.status === 'active' && conn.sslStatus === 'active')
    return { verify: 'done', activate: 'done', ssl: 'done' };
  if (conn.status === 'active' && conn.sslStatus === 'failed')
    return { verify: 'done', activate: 'done', ssl: 'error' };
  if (conn.status === 'active')
    return { verify: 'done', activate: 'done', ssl: 'current' };
  if (conn.status === 'verified')
    return { verify: 'done', activate: 'current', ssl: 'upcoming' };
  return { verify: 'current', activate: 'upcoming', ssl: 'upcoming' };
}

/* Horizontal stepper */
function Stepper({ phases }: { phases: { verify: StepPhase; activate: StepPhase; ssl: StepPhase } }) {
  const steps = [
    { phase: phases.verify,   label: 'Verify' },
    { phase: phases.activate, label: 'Activate' },
    { phase: phases.ssl,      label: 'SSL' },
  ];

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          {/* Step node */}
          <div className="flex items-center gap-1.5">
            {step.phase === 'done' ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              </div>
            ) : step.phase === 'error' ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
                <XCircle className="h-3 w-3 text-red-400" />
              </div>
            ) : step.phase === 'current' ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-white">
                {i + 1}
              </div>
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.1] text-[9px] font-medium text-white/25">
                {i + 1}
              </div>
            )}
            <span className={`text-xs ${
              step.phase === 'done' ? 'text-emerald-300' :
              step.phase === 'error' ? 'text-red-300' :
              step.phase === 'current' ? 'text-cyan-200 font-medium' :
              'text-white/25'
            }`}>
              {step.label}
            </span>
          </div>
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className={`mx-2 h-px w-6 ${step.phase === 'done' ? 'bg-emerald-500/40' : 'bg-white/[0.08]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function statusBadge(status: DomainConnection['status']) {
  const cfg: Record<string, { dot: string; text: string; label: string }> = {
    active:  { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Active' },
    verified:{ dot: 'bg-cyan-400',    text: 'text-cyan-300',    label: 'Verified' },
    pending: { dot: 'bg-amber-400',   text: 'text-amber-300',   label: 'Pending' },
    failed:  { dot: 'bg-red-400',     text: 'text-red-300',     label: 'Failed' },
  };
  const c = cfg[status] || { dot: 'bg-white/30', text: 'text-white/50', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
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
  /** True when ANY operation across any connection is in progress. */
  anyOperationRunning: boolean;
  /** True when the domain's nameservers point to an external DNS provider instead of AhuraCloud. */
  usingCustomNameservers?: boolean;
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
  anyOperationRunning,
  usingCustomNameservers,
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
    <div className="space-y-5">
      {/* ── Setup guide (collapsible) ── */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
          onClick={() => setShowGuide((v) => !v)}
        >
          <p className="text-sm font-medium text-white">How to Connect a Domain</p>
          <span className="text-xs text-white/35">{showGuide ? 'Hide' : 'Show'}</span>
        </button>

        {showGuide && (
          <div className="border-t border-white/[0.06] p-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                num: '1',
                title: 'Add & Verify',
                color: 'text-cyan-300',
                bg: 'bg-cyan-500/15 border-cyan-500/20',
                body: 'Connect a domain to an app below, then add a TXT record at your DNS provider and click Verify.',
                code: 'Type: TXT\nHost: galaxyhvh-verify.<domain>\nValue: (shown after connecting)',
              },
              {
                num: '2',
                title: 'Activate',
                color: 'text-cyan-300',
                bg: 'bg-cyan-500/15 border-cyan-500/20',
                body: 'Once verified, click Activate. Add a CNAME (subdomain) or A record (apex) to route traffic.',
                code: 'Subdomain: CNAME → app.galaxyhvh.com\nRoot (@): A → 139.59.1.6',
              },
              {
                num: '3',
                title: 'SSL Active',
                color: 'text-emerald-300',
                bg: 'bg-emerald-500/15 border-emerald-500/20',
                body: "Once DNS propagates, a free Let's Encrypt certificate is issued automatically. Your domain is live.",
                code: null,
              },
            ].map((step) => (
              <div key={step.num} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${step.bg} ${step.color}`}>
                    {step.num}
                  </span>
                  <span className="text-sm font-medium text-white">{step.title}</span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">{step.body}</p>
                {step.code && (
                  <pre className="rounded-md border border-white/[0.06] bg-black/30 px-2.5 py-2 text-[10px] font-mono text-white/40 whitespace-pre-wrap leading-relaxed">
                    {step.code}
                  </pre>
                )}
                {!step.code && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400/60">
                    <Lock className="h-3 w-3" />
                    Automatic HTTPS
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Custom nameserver notice ── */}
      {usingCustomNameservers && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/15 bg-amber-500/[0.04]">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs font-semibold text-amber-300 tracking-wide uppercase">DNS is managed outside AhuraCloud</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {([
                { n: '1', text: 'Add a connection to an app' },
                { n: '2', text: 'Add the TXT record and click Verify' },
                { n: '3', text: 'Add the routing record at your DNS provider' },
                { n: '4', text: 'Click Activate; SSL provisions after DNS propagates' },
              ] as const).map((step) => (
                <div key={step.n} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-400">
                    {step.n}
                  </span>
                  <p className="text-xs text-amber-200/60 leading-relaxed pt-0.5">{step.text}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-200/35 border-t border-amber-500/10 pt-2.5">
              If your DNS provider offers proxy or CDN mode, keep this record as direct DNS while SSL is provisioning. After SSL is active, proxy mode can be enabled when the provider&apos;s TLS mode is compatible.
            </p>
          </div>
        </div>
      )}

      {/* ── Connect domain form ── */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">Connect Domain</p>
          <p className="mt-0.5 text-xs text-white/45">
            Attach <span className="font-mono text-white/60">{domainName}</span> or a subdomain to one of your apps.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="subdomain-input" className="text-xs text-white/50">
              Subdomain <span className="text-white/30">(optional)</span>
            </Label>
            <Input
              id="subdomain-input"
              placeholder="e.g. api, www, blog"
              value={subdomainInput}
              onChange={(e) => onSubdomainChange(e.target.value)}
              className="h-9 bg-black/30 border-white/[0.08] font-mono text-sm focus:border-white/[0.2]"
            />
            <p className="text-[10px] text-white/30">Leave empty for root domain</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Select app</Label>
            <DomainAttachAction
              domain={attachDomain}
              appOptions={appOptions}
              buttonLabel="Add Connection"
              onAttached={onAttached}
              disabled={anyOperationRunning}
            />
            <p className="text-[10px] text-white/30 flex items-center gap-1">
              <Globe className="h-2.5 w-2.5 shrink-0" />
              Will connect <span className="font-mono text-white/50 ml-1">{attachDomain}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Connections list ── */}
      <div className="space-y-3">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white/70">
            Connections
            {connections.length > 0 && (
              <span className="ml-1.5 text-white/30 font-normal">({connections.length})</span>
            )}
          </p>
          <p className="text-[10px] text-white/25">
            Max 5 per app
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading connections…
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] p-8 text-center">
            <Globe className="h-8 w-8 mx-auto text-white/20 mb-3" />
            <p className="text-sm text-white/50 mb-1">No connections yet</p>
            <p className="text-xs text-white/30">Use the form above to connect this domain to your app.</p>
          </div>
        ) : (
          connections.map((connection) => {
            const phases = stepPhaseForConnection(connection);
            const isRoot = connection.hostLabel === '@';
            const routingIps = [...new Set(connection.routingIps.filter(Boolean))];

            // Compute routing mode early — SslStatusBadge needs it to avoid redundant messaging.
            const hasRoutingRecord =
              (connection.status === 'verified' || connection.status === 'active') &&
              !!(connection.routingTarget || routingIps.length > 0);
            const dnsConfirmedReady = connection.dnsReady === true || connection.sslStatus === 'active';
            const routingMode: 'action-warn' | 'action-add' | 'info' = hasRoutingRecord
              ? connection.dnsReady === false && connection.sslStatus !== 'active'
                ? 'action-warn'
                : usingCustomNameservers && connection.status === 'active' && !dnsConfirmedReady
                  ? 'action-add'
                  : 'info'
              : 'info';

            return (
              <div
                key={connection.id}
                className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium font-mono text-white truncate">{connection.domain}</span>
                    {statusBadge(connection.status)}
                    {connection.isPrimary && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-white/35 border border-white/[0.08] rounded px-1.5 py-0.5">
                        <Star className="h-2.5 w-2.5" /> Primary
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(connection.status === 'pending' || connection.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-white/[0.1] text-white/70 hover:bg-white/[0.06] hover:text-white text-xs"
                        disabled={anyOperationRunning}
                        onClick={() => onVerify(connection.id)}
                      >
                        {verifyingConnectionId === connection.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><ShieldCheck className="h-3 w-3 mr-1" />Verify</>
                        )}
                      </Button>
                    )}
                    {connection.status === 'verified' && (
                      <Button
                        size="sm"
                        className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs border-0"
                        disabled={anyOperationRunning || connection.appStatus !== 'running'}
                        onClick={() => onActivate(connection.id)}
                        title={
                          connection.appStatus !== 'running'
                            ? 'App must be running first'
                            : usingCustomNameservers
                              ? 'DNS records must be added manually at your DNS provider after activation'
                              : undefined
                        }
                      >
                        {activatingConnectionId === connection.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><Check className="h-3 w-3 mr-1" />Activate</>
                        )}
                      </Button>
                    )}
                    {connection.status === 'active' && !connection.isPrimary && connection.sslStatus !== 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-white/[0.1] text-white/70 hover:bg-white/[0.06] hover:text-white text-xs"
                        disabled={anyOperationRunning}
                        onClick={() => onSetPrimary(connection.id)}
                      >
                        {settingPrimaryConnectionId === connection.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><Star className="h-3 w-3 mr-1" />Set Primary</>
                        )}
                      </Button>
                    )}
                    {connection.status === 'active' && connection.sslStatus === 'failed' && (
                      <Button
                        size="sm"
                        className="h-7 bg-orange-600 hover:bg-orange-700 text-white text-xs border-0"
                        disabled={anyOperationRunning || connection.appStatus !== 'running'}
                        onClick={() => onActivate(connection.id)}
                        title="Re-activate to retry SSL setup"
                      >
                        {activatingConnectionId === connection.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><RefreshCw className="h-3 w-3 mr-1" />Re-Activate</>
                        )}
                      </Button>
                    )}
                    <Link href={`/dashboard/services/apps/${connection.appId}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-white/35 hover:text-white hover:bg-white/[0.06]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-400/40 hover:text-red-300 hover:bg-red-500/[0.06]"
                      disabled={anyOperationRunning}
                      onClick={() => onRemoveRequest(connection.id)}
                    >
                      {removingConnectionId === connection.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 py-3 space-y-3">
                  {/* Progress stepper */}
                  <Stepper phases={phases} />

                  {/* Info row */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/45">
                    <span>
                      Host:{' '}
                      <span className="font-mono text-white/65">
                        {isRoot ? `${domainName} (root)` : connection.hostLabel}
                      </span>
                    </span>
                    <span>
                      App:{' '}
                      <span className="text-white/65">{connection.appName}</span>
                      <span className="text-white/25 ml-1">({connection.appStatus})</span>
                    </span>
                  </div>

                  {/* SSL status */}
                  <SslStatusBadge
                    sslStatus={connection.sslStatus}
                    id={connection.id}
                    onCheck={connection.status === 'active' && !anyOperationRunning ? onCheckSsl : undefined}
                    checkingId={checkingSslId}
                    variant="row"
                    dnsMessage={connection.dnsReady === false && routingMode !== 'action-add' ? connection.dnsMessage : undefined}
                  />

                  {/* Verification record */}
                  {(connection.status === 'pending' || connection.status === 'failed') &&
                    connection.verificationToken && (
                      <div className="rounded-md border border-amber-500/15 bg-amber-500/[0.04] p-3 space-y-2">
                        <p className="text-xs font-medium text-amber-300/80 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Step 1: Add this TXT record to verify ownership
                        </p>
                        <div className="overflow-x-auto rounded border border-white/[0.06] bg-black/30">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/25">
                                <th className="px-3 py-1.5 text-left w-14">Type</th>
                                <th className="px-3 py-1.5 text-left">Host / Name</th>
                                <th className="px-3 py-1.5 text-left">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="text-white/65">
                                <td className="px-3 py-1.5">
                                  <span className="inline-flex items-center rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold font-mono text-amber-300">TXT</span>
                                </td>
                                <td className="px-3 py-1.5 font-mono break-all">
                                  galaxyhvh-verify.{connection.domain}
                                  <CopyBtn value={`galaxyhvh-verify.${connection.domain}`} label="Host" />
                                </td>
                                <td className="px-3 py-1.5 font-mono break-all max-w-[180px]">
                                  <span className="block truncate">{connection.verificationToken}</span>
                                  <CopyBtn value={connection.verificationToken} label="Token" />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[10px] text-amber-100/40">
                          Wait 1–5 minutes for DNS to propagate, then click Verify above.
                        </p>
                      </div>
                    )}

                  {/* Routing record */}
                  {hasRoutingRecord && (() => {
                      const mode = routingMode;
                      const isVerified = connection.status === 'verified';
                      const showProxyNote = usingCustomNameservers && !isRoot && (isVerified || mode !== 'info');

                      const borderClass =
                        isVerified || mode === 'action-add'
                          ? 'border-cyan-500/15 bg-cyan-500/[0.04]'
                          : mode === 'action-warn'
                            ? 'border-amber-500/20 bg-amber-500/[0.04]'
                            : 'border-white/[0.06] bg-white/[0.015]';

                      const headerIcon = isVerified || mode === 'action-add'
                        ? <Globe className="h-3.5 w-3.5" />
                        : mode === 'action-warn'
                          ? <AlertTriangle className="h-3.5 w-3.5" />
                          : <Globe className="h-3.5 w-3.5" />;

                      const headerTextClass =
                        isVerified || mode === 'action-add'
                          ? 'text-cyan-300/80'
                          : mode === 'action-warn'
                            ? 'text-amber-300/80'
                            : 'text-white/35';

                      const recordBadgeClass =
                        isVerified || mode === 'action-add'
                          ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'
                          : mode === 'action-warn'
                            ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                            : 'border-white/10 bg-white/5 text-white/50';

                      const headerLabel = isVerified
                        ? 'Step 2: Add this DNS record to route traffic'
                        : mode === 'action-warn'
                          ? 'DNS not pointing to platform — update this record'
                          : mode === 'action-add'
                            ? 'Add this record at your DNS provider'
                            : 'Routing record';

                      const footerNote = isVerified
                        ? 'Add this record at your DNS provider, then click Activate. SSL issues automatically.'
                        : mode === 'action-add'
                          ? 'Go to your DNS provider dashboard, add the record above, then click Check SSL to confirm propagation.'
                          : null;

                      return (
                        <div className={`rounded-md border p-3 space-y-2 ${borderClass}`}>
                          <p className={`text-xs font-medium flex items-center gap-1.5 ${headerTextClass}`}>
                            {headerIcon}
                            {headerLabel}
                          </p>
                          <div className="overflow-x-auto rounded border border-white/[0.06] bg-black/30">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/25">
                                  <th className="px-3 py-1.5 text-left w-14">Type</th>
                                  <th className="px-3 py-1.5 text-left">Host / Name</th>
                                  <th className="px-3 py-1.5 text-left">Value / Points to</th>
                                </tr>
                              </thead>
                              <tbody>
                                {isRoot && routingIps.length > 0 ? (
                                  routingIps.map((ip) => (
                                    <tr key={ip} className="text-white/65 border-t border-white/[0.04] first:border-t-0">
                                      <td className="px-3 py-1.5">
                                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold font-mono ${recordBadgeClass}`}>A</span>
                                      </td>
                                      <td className="px-3 py-1.5 font-mono">
                                        @<span className="text-white/25 ml-1.5">({domainName})</span>
                                      </td>
                                      <td className="px-3 py-1.5 font-mono">
                                        {ip}<CopyBtn value={ip} label="IP address" />
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr className="text-white/65">
                                    <td className="px-3 py-1.5">
                                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold font-mono ${recordBadgeClass}`}>
                                        {isRoot ? (routingIps.length > 0 ? 'A' : 'ANAME') : 'CNAME'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 font-mono">
                                      {isRoot ? '@' : connection.hostLabel}
                                      {isRoot && <span className="text-white/25 ml-1.5">({domainName})</span>}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono break-all">
                                      {connection.routingTarget || 'Pending…'}
                                      {connection.routingTarget && (
                                        <CopyBtn value={connection.routingTarget} label="Routing value" />
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {footerNote && (
                            <p className="text-[10px] text-white/30">{footerNote}</p>
                          )}
                          {showProxyNote && (
                            <p className="text-[10px] text-amber-200/35">
                              If your provider has proxy or CDN mode, keep this record as direct DNS while SSL is provisioning.
                            </p>
                          )}
                        </div>
                      );
                    })()
                  }

                  {/* Error */}
                  {connection.lastError && (
                    <div className="flex items-start gap-2 rounded-md border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
                      <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-300/80">{sanitizeLastError(connection.lastError)}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={removeConfirmConnectionId !== null}
        onOpenChange={(open) => { if (!open && !removingConnectionId) onRemoveCancel(); }}
      >
        <AlertDialogContent className="bg-[#0d0d0d] border border-white/[0.08] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this domain?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {confirmConn?.domain ? (
                <>
                  <span className="font-mono text-white/80">{confirmConn.domain}</span> will be disconnected
                  from <span className="text-white/80">{confirmConn.appName}</span>.{' '}
                </>
              ) : (
                'This domain will be disconnected from this app. '
              )}
              Your domain stays in your account — you can reconnect it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-white/[0.12] text-white/70 hover:bg-white/[0.06] hover:text-white"
              onClick={onRemoveCancel}
              disabled={removingConnectionId !== null}
            >
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white border-0"
              disabled={removingConnectionId !== null}
              onClick={() => {
                if (removeConfirmConnectionId) onRemoveConfirm(removeConfirmConnectionId);
              }}
            >
              {removingConnectionId !== null ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Disconnecting…</>
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
