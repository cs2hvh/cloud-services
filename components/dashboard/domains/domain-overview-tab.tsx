'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock,
  Globe,
  Lock,
  ShieldAlert,
  XCircle,
  Zap,
} from 'lucide-react';
import type { DomainConnectionItem, DomainPurchase, RelatedDomain } from './domain-detail-types';

interface DomainOverviewTabProps {
  purchaseRequest: DomainPurchase | null;
  connections: DomainConnectionItem[];
  connectedAppNames: string[];
  relatedDomains?: RelatedDomain[];
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-white">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04] last:border-0">
      <span className="text-sm text-white/45 shrink-0 min-w-[140px]">{label}</span>
      <span className="text-sm text-white/80 text-right">{children}</span>
    </div>
  );
}

function PurchaseStatusBadge({ status }: { status: DomainPurchase['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Purchased
        </span>
      );
    case 'processing':
    case 'requested':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
          <Clock className="h-3.5 w-3.5" /> Processing
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-300">
          <ShieldAlert className="h-3.5 w-3.5" /> Failed
        </span>
      );
    case 'cancelled':
      return <span className="text-xs text-white/40">Cancelled</span>;
    default:
      return <span className="text-xs text-white/40">—</span>;
  }
}

export function DomainOverviewTab({
  purchaseRequest,
  connections,
  connectedAppNames,
  relatedDomains,
}: DomainOverviewTabProps) {
  const activeCount = connections.filter((c) => c.status === 'active').length;
  const pendingCount = connections.filter((c) => c.status === 'pending' || c.status === 'verified').length;
  const failedCount = connections.filter((c) => c.status === 'failed').length;
  const sslActive = connections.some((c) => c.sslStatus === 'active');
  const sslIssuing = connections.some((c) => c.sslStatus === 'issuing');

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <Stat label="Connections" value={connections.length} />
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <Stat
            label="Active"
            value={activeCount}
            sub={pendingCount > 0 ? `${pendingCount} pending` : undefined}
          />
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/35">SSL / TLS</p>
            <p className="text-sm font-semibold text-white flex items-center gap-1.5 mt-2">
              {sslActive ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Active</span>
                </>
              ) : sslIssuing ? (
                <>
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-300">Issuing</span>
                </>
              ) : (
                <>
                  <Circle className="h-3.5 w-3.5 text-white/30" />
                  <span className="text-white/50">Pending</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/35">Apps</p>
            <p className="text-sm font-semibold text-white truncate mt-2">
              {connectedAppNames.length > 0 ? connectedAppNames.join(', ') : (
                <span className="text-white/35 font-normal">None</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Domain details property list */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-medium text-white">Domain Details</p>
        </div>
        <div className="px-4">
          <PropRow label="Purchase status">
            {purchaseRequest ? (
              <PurchaseStatusBadge status={purchaseRequest.status} />
            ) : (
              <span className="text-xs text-white/40">External domain</span>
            )}
          </PropRow>
          <PropRow label="Setup progress">
            <div className="flex items-center gap-3 text-xs">
              {failedCount > 0 && (
                <span className="flex items-center gap-1.5 text-red-300">
                  <XCircle className="h-3 w-3" /> {failedCount} failed
                </span>
              )}
              {pendingCount > 0 && (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Zap className="h-3 w-3" /> {pendingCount} pending
                </span>
              )}
              {activeCount > 0 && (
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> {activeCount} active
                </span>
              )}
              {connections.length === 0 && (
                <span className="text-white/35">No connections yet</span>
              )}
            </div>
          </PropRow>
          <PropRow label="Connected apps">
            {connectedAppNames.length > 0 ? (
              <span>{connectedAppNames.join(', ')}</span>
            ) : (
              <span className="text-white/35">None</span>
            )}
          </PropRow>
        </div>
      </div>

      {/* Connections summary table */}
      {connections.length > 0 ? (
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-sm font-medium text-white">Connections</p>
            <span className="text-xs text-white/35">{connections.length} total</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-medium uppercase tracking-wider text-white/30 border-b border-white/[0.04]">
                <th className="px-4 py-2.5 text-left">Domain</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">App</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">SSL</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono text-white/70">{c.domain}</span>
                    {c.isPrimary && (
                      <span className="ml-2 text-[10px] text-white/30 border border-white/[0.08] rounded px-1 py-0.5">primary</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className="text-xs text-white/50">{c.appName}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                      </span>
                    ) : c.status === 'verified' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-cyan-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Verified
                      </span>
                    ) : c.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    {c.sslStatus === 'active' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Active
                      </span>
                    ) : c.sslStatus === 'issuing' ? (
                      <span className="text-xs text-amber-300">Issuing</span>
                    ) : (
                      <span className="text-xs text-white/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/[0.08] p-8 text-center">
          <Globe className="h-8 w-8 mx-auto text-white/20 mb-3" />
          <p className="text-sm text-white/50 mb-1">No connections yet</p>
          <p className="text-xs text-white/30 max-w-sm mx-auto">
            Go to the Connections tab to point this domain to one of your apps.
          </p>
        </div>
      )}

      {/* Related domains */}
      {relatedDomains && relatedDomains.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-sm font-medium text-white">Related Domains</p>
            <span className="text-xs text-white/35">{relatedDomains.length}</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {relatedDomains.map(({ domain, role }) => (
              <Link
                key={domain}
                href={`/dashboard/domains/${encodeURIComponent(domain)}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors group"
              >
                <span className="text-sm font-mono text-white/70 group-hover:text-white transition-colors truncate">
                  {domain}
                </span>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-[11px] text-white/30">
                    {role === 'parent' ? 'Parent zone' : role === 'sibling' ? 'Sibling' : 'Subdomain'}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
