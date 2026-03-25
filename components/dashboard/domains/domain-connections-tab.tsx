'use client';

import Link from 'next/link';
import { Check, ExternalLink, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react';

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
import { DomainAttachAction, type DomainAppOption } from './domain-attach-action';
import type { DomainConnection, DomainConnectionItem } from './domain-detail-types';
import { sanitizeLastError } from './domain-detail-types';
import { SslStatusBadge } from '@/components/ui/ssl-status-badge';

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

  return (
    <>
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-base">Connected Apps</CardTitle>
          <CardDescription className="text-white/60">
            Attach {domainName} or its subdomains to any of your apps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Attach form */}
          <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="subdomain-input" className="text-xs text-white/70">
                Subdomain (optional)
              </Label>
              <Input
                id="subdomain-input"
                placeholder="@ for root, or api"
                value={subdomainInput}
                onChange={(e) => onSubdomainChange(e.target.value)}
                className="bg-black/30 border-white/10"
              />
              <p className="text-xs text-white/50">Target: {attachDomain}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-white/70">Attach to app</Label>
              <DomainAttachAction
                domain={attachDomain}
                appOptions={appOptions}
                buttonLabel="Add Connection"
                onAttached={onAttached}
              />
            </div>
          </div>

          {/* Connections list */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading connections...
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/55">
              No connections yet.
            </div>
          ) : (
            <div className="space-y-2">
              {connections.map((connection) => (
                <div key={connection.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{connection.domain}</p>
                      <p className="text-xs text-white/60 mt-1">
                        {connection.hostLabel === '@'
                          ? `${domainName} (root)`
                          : `${connection.domain} (${connection.hostLabel})`}
                      </p>
                      <p className="text-xs text-white/60 mt-1">
                        App: {connection.appName} ({connection.appStatus})
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {statusBadge(connection.status)}
                        {connection.status !== 'active' && (!connection.sslStatus || connection.sslStatus === 'pending') && (
                          <Badge className="border-white/20 bg-white/10 text-white/80">
                            SSL: {connection.sslStatus ?? 'pending'}
                          </Badge>
                        )}
                        {connection.isPrimary && (
                          <Badge className="border-blue-500/30 bg-blue-500/20 text-blue-200">
                            Primary
                          </Badge>
                        )}
                      </div>
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
                      {(connection.status === 'pending' || connection.status === 'failed') &&
                        connection.verificationToken && (
                          <div className="mt-2 rounded border border-yellow-500/25 bg-yellow-500/10 p-2 text-xs text-yellow-100">
                            <p className="font-medium text-yellow-100">Verification record needed</p>
                            <p className="mt-1">
                              Add TXT <span className="font-mono text-yellow-50">{`galaxyhvh-verify.${connection.domain}`}</span>{' '}
                              with value <span className="font-mono text-yellow-50">{connection.verificationToken}</span>, then click Verify.
                            </p>
                          </div>
                        )}
                      {connection.lastError && (
                        <p className="text-xs text-red-300 mt-2">
                          {sanitizeLastError(connection.lastError)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(connection.status === 'pending' || connection.status === 'failed') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10"
                          disabled={verifyingConnectionId === connection.id}
                          onClick={() => onVerify(connection.id)}
                        >
                          {verifyingConnectionId === connection.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Verify'
                          )}
                        </Button>
                      )}
                      {connection.status === 'verified' && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
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
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                      )}
                      {connection.status === 'active' && !connection.isPrimary && connection.sslStatus !== 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10"
                          disabled={settingPrimaryConnectionId === connection.id}
                          onClick={() => onSetPrimary(connection.id)}
                        >
                          {settingPrimaryConnectionId === connection.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Star className="h-3.5 w-3.5 mr-1" />
                              Set Primary
                            </>
                          )}
                        </Button>
                      )}
                      {connection.status === 'active' && connection.sslStatus === 'failed' && (
                        <Button
                          size="sm"
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                          disabled={
                            activatingConnectionId === connection.id ||
                            connection.appStatus !== 'running'
                          }
                          onClick={() => onActivate(connection.id)}
                          title={
                            connection.appStatus !== 'running'
                              ? 'App must be running to re-activate.'
                              : 'Re-activate to retry secure-connection setup'
                          }
                        >
                          {activatingConnectionId === connection.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Re-Activate
                            </>
                          )}
                        </Button>
                      )}
                      <Link href={`/dashboard/services/apps/${connection.appId}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 text-white hover:bg-white/10"
                        >
                          View App
                          <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-200 hover:bg-red-500/10"
                        disabled={removingConnectionId === connection.id}
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
                </div>
              ))}
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
                  from this app.{' '}
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
