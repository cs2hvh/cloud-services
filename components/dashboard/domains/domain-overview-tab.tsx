'use client';

import { CheckCircle2, Clock, Globe, Lock, Server, ShieldAlert, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DomainConnectionItem, DomainPurchase } from './domain-detail-types';

interface DomainOverviewTabProps {
  purchaseRequest: DomainPurchase | null;
  connections: DomainConnectionItem[];
  connectedAppNames: string[];
}

export function DomainOverviewTab({
  purchaseRequest,
  connections,
  connectedAppNames,
}: DomainOverviewTabProps) {
  const activeCount = connections.filter((c) => c.status === 'active').length;
  const verifiedCount = connections.filter((c) => c.status === 'verified').length;
  const pendingCount = connections.filter((c) => c.status === 'pending').length;
  const sslActive = connections.some((c) => c.sslStatus === 'active');
  const sslIssuing = connections.some((c) => c.sslStatus === 'issuing');

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                <Globe className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-white/45">Connections</p>
                <p className="text-lg font-semibold text-white">{connections.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-white/45">Active</p>
                <p className="text-lg font-semibold text-white">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Lock className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-white/45">SSL / TLS</p>
                <p className="text-sm font-medium text-white">
                  {sslActive ? 'Active' : sslIssuing ? 'Issuing…' : 'Pending'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                <Server className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-white/45">Apps</p>
                <p className="text-sm font-medium text-white">
                  {connectedAppNames.length > 0 ? connectedAppNames.join(', ') : 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Domain Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/8 bg-black/20 p-3 space-y-1">
              <p className="text-[11px] text-white/40 uppercase tracking-wide">Purchase Status</p>
              <div className="flex items-center gap-2">
                {purchaseRequest?.status === 'completed' ? (
                  <Badge className="border-green-500/30 bg-green-500/10 text-green-300 text-xs">Purchased</Badge>
                ) : purchaseRequest?.status === 'processing' || purchaseRequest?.status === 'requested' ? (
                  <Badge className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Processing
                  </Badge>
                ) : purchaseRequest?.status === 'failed' ? (
                  <Badge className="border-red-500/30 bg-red-500/10 text-red-300 text-xs">
                    <ShieldAlert className="h-3 w-3 mr-1" />
                    Failed
                  </Badge>
                ) : (
                  <span className="text-sm text-white/60">External — not purchased through us</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/8 bg-black/20 p-3 space-y-1">
              <p className="text-[11px] text-white/40 uppercase tracking-wide">Setup Progress</p>
              <div className="flex items-center gap-3 text-sm text-white/70">
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-yellow-400" />
                    {pendingCount} pending
                  </span>
                )}
                {verifiedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-cyan-400" />
                    {verifiedCount} verified
                  </span>
                )}
                {activeCount > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-400" />
                    {activeCount} active
                  </span>
                )}
                {connections.length === 0 && <span className="text-white/40">No connections yet</span>}
              </div>
            </div>
          </div>

          {/* Connection list summary */}
          {connections.length > 0 && (
            <div className="rounded-lg border border-white/8 bg-black/20 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-[11px] text-white/40 uppercase tracking-wide">All Connections</p>
              </div>
              <div className="divide-y divide-white/5">
                {connections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-white/70 truncate">{c.domain}</span>
                      <span className="text-[10px] text-white/30">→ {c.appName}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.status === 'active' ? (
                        <Badge className="border-green-500/30 bg-green-500/10 text-green-300 text-[10px]">Active</Badge>
                      ) : c.status === 'verified' ? (
                        <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[10px]">Verified</Badge>
                      ) : c.status === 'pending' ? (
                        <Badge className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-[10px]">Pending</Badge>
                      ) : (
                        <Badge className="border-red-500/30 bg-red-500/10 text-red-300 text-[10px]">Failed</Badge>
                      )}
                      {c.sslStatus === 'active' && (
                        <Lock className="h-3 w-3 text-emerald-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
