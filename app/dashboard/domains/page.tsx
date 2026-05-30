'use client';

// Domains dashboard — editorial dark surface matching the VPS / GPU / custom-
// images pages: aurora + dotted-grid canvas, Nunito accent title, mono labels,
// brand-blue accent, stat tiles, filter chips, and a styled inventory table
// (root + subdomain grouping, status pills, ICANN-email note). Logic unchanged.

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Copy,
  Globe,
  Mail,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Design tokens ─────────────────────────────────────────────────
const SERIF_STYLE: React.CSSProperties = { fontFamily: 'var(--font-nunito), system-ui, sans-serif' };
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';
const ACCENT_DIM = 'rgba(0,149,255,0.08)';

interface DomainPurchase {
  id: string;
  app_id: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  last_error: string | null;
  registrant_email: string | null;
}

interface DomainConnection {
  id: string;
  app_id: string;
  app_name: string;
  app_status: string;
  domain: string;
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  ssl_status: 'pending' | 'issuing' | 'active' | 'failed';
  is_primary: boolean;
  last_error: string | null;
  created_at: string;
}

interface DomainInventoryItem {
  domain: string;
  purchase: DomainPurchase | null;
  connections: DomainConnection[];
  source: 'purchased' | 'external' | 'mixed' | 'transferred';
  expires_at: string | null;
  auto_renew: boolean | null;
}

type DomainStatus = 'active' | 'pending' | 'attention' | 'purchased' | 'unknown';

const STATUS_COLOR: Record<DomainStatus, string> = {
  active: '#4ade80',
  pending: '#fbbf24',
  attention: '#f87171',
  purchased: ACCENT,
  unknown: 'rgba(255,255,255,0.45)',
};

function getDomainStatus(item: DomainInventoryItem): { status: DomainStatus; label: string } {
  const purchaseStatus = item.purchase?.status;
  const hasActive = item.connections.some((c) => c.status === 'active');
  const hasFailed = purchaseStatus === 'failed' || item.connections.some((c) => c.status === 'failed');
  const hasPendingPurchase = purchaseStatus === 'requested' || purchaseStatus === 'processing';
  const hasPendingSetup = item.connections.some((c) => c.status === 'pending' || c.status === 'verified');

  if (hasFailed) return { status: 'attention', label: 'Needs attention' };
  if (hasPendingPurchase || hasPendingSetup) return { status: 'pending', label: 'Pending' };
  if (hasActive) return { status: 'active', label: 'Active' };
  if (purchaseStatus === 'completed') {
    return item.source === 'transferred'
      ? { status: 'purchased', label: 'Transferred' }
      : { status: 'purchased', label: 'Purchased' };
  }
  return { status: 'unknown', label: 'Unknown' };
}

function StatusPill({ status, label }: { status: DomainStatus; label: string }) {
  const color = STATUS_COLOR[status];
  const pulse = status === 'pending';
  return (
    <span className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold`} style={{ color }}>
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${pulse ? 'animate-pulse' : ''}`}
        style={{ background: color, boxShadow: status === 'unknown' ? 'none' : `0 0 5px ${color}` }}
      />
      {label}
    </span>
  );
}

function needsAttention(item: DomainInventoryItem): boolean {
  if (item.purchase?.status === 'failed') return true;
  return item.connections.some((c) => c.status === 'failed');
}

function isExpiringSoon(expiresAt: string | null, days: number): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(now.getDate() + days);
  return expiry >= now && expiry <= horizon;
}

function copyDomain(domain: string) {
  navigator.clipboard.writeText(domain);
  toast.success('Domain copied');
}

/* ── Domain grouping (root + subdomains) ── */
type DomainGroup = {
  rootDomain: string;
  root: DomainInventoryItem | null;
  children: DomainInventoryItem[];
};

function groupDomains(items: DomainInventoryItem[]): DomainGroup[] {
  const domainSet = new Set(items.map((i) => i.domain));

  function findParent(domain: string): string | null {
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join('.');
      if (domainSet.has(candidate)) return candidate;
    }
    return null;
  }

  const groupMap = new Map<string, DomainGroup>();
  const parentOf = new Map<string, string>();
  for (const item of items) {
    const parent = findParent(item.domain);
    if (parent) parentOf.set(item.domain, parent);
  }

  for (const item of items) {
    const parent = parentOf.get(item.domain);
    if (!parent) {
      const existing = groupMap.get(item.domain);
      if (existing) {
        existing.root = item;
      } else {
        groupMap.set(item.domain, { rootDomain: item.domain, root: item, children: [] });
      }
    } else {
      let rootKey = parent;
      while (parentOf.has(rootKey)) rootKey = parentOf.get(rootKey)!;
      if (!groupMap.has(rootKey)) {
        groupMap.set(rootKey, { rootDomain: rootKey, root: null, children: [] });
      }
      groupMap.get(rootKey)!.children.push(item);
    }
  }

  return Array.from(groupMap.values())
    .sort((a, b) => a.rootDomain.localeCompare(b.rootDomain))
    .map((g) => ({ ...g, children: [...g.children].sort((a, b) => a.domain.localeCompare(b.domain)) }));
}

const COLS = 6;

/* ── Skeleton ── */
function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-white/[0.04]">
          {Array.from({ length: COLS }).map((__, j) => (
            <td key={j} className="px-5 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-white/[0.05]" style={{ width: j === 0 ? 160 : 60 }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ── Row ── */
function DomainRow({ item, parentDomain }: { item: DomainInventoryItem; parentDomain?: string }) {
  const { status, label } = getDomainStatus(item);
  const activeConns = item.connections.filter((c) => c.status === 'active').length;
  const isChild = !!parentDomain;
  const subPrefix =
    isChild && item.domain.endsWith('.' + parentDomain)
      ? item.domain.slice(0, item.domain.length - parentDomain.length - 1)
      : null;

  return (
    <tr className={`group border-t border-white/[0.04] transition-colors hover:bg-white/[0.02]${isChild ? ' bg-white/[0.01]' : ''}`}>
      {/* Domain */}
      <td className="px-5 py-3">
        <div className={`flex items-center gap-2 min-w-0${isChild ? ' pl-5' : ''}`}>
          {isChild ? (
            <span className="shrink-0 text-white/20 text-xs select-none leading-none">└</span>
          ) : (
            <span className="h-7 w-7 shrink-0 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[6px] text-white/45">
              <Globe className="h-3.5 w-3.5" />
            </span>
          )}
          <Link
            href={`/dashboard/domains/${encodeURIComponent(item.domain)}`}
            className={`${MONO} text-[12.5px] font-medium text-white hover:text-[#33adff] transition-colors truncate`}
          >
            {subPrefix ? (
              <>
                <span>{subPrefix}</span>
                <span className="text-white/35">.{parentDomain}</span>
              </>
            ) : (
              item.domain
            )}
          </Link>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); copyDomain(item.domain); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-white/30 hover:text-white/65"
            title="Copy domain"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
        {item.purchase?.status === 'completed' && (() => {
          const withinIcannWindow = item.purchase.created_at
            ? Date.now() - new Date(item.purchase.created_at).getTime() < 15 * 24 * 60 * 60 * 1000
            : false;
          const isSandboxSentinel = item.purchase.registrant_email?.endsWith('@not-found.invalid');
          const displayEmail = isSandboxSentinel ? null : item.purchase.registrant_email;
          if (!displayEmail && !withinIcannWindow) return null;
          return (
            <div className={`mt-1 flex items-center gap-1.5 ${isChild ? 'pl-10' : 'pl-9'}`}>
              <Mail className="h-2.5 w-2.5 shrink-0 text-white/25" />
              {displayEmail ? (
                <span className={`${MONO} text-[10px] text-white/35`} title="ICANN verification email sent to this address">
                  ICANN → <span className="text-white/55">{displayEmail}</span>
                </span>
              ) : (
                <span className={`${MONO} text-[10px] text-amber-400/70`} title="Verification email routing pending — retries automatically">
                  ICANN email routing pending…
                </span>
              )}
            </div>
          );
        })()}
      </td>

      {/* Status */}
      <td className="px-5 py-3"><StatusPill status={status} label={label} /></td>

      {/* Connections */}
      <td className="px-5 py-3 hidden lg:table-cell">
        <span className={`${MONO} text-[11.5px] tabular-nums text-white/60`}>
          {item.connections.length > 0 ? `${activeConns}/${item.connections.length}` : <span className="text-white/25">—</span>}
        </span>
      </td>

      {/* Expires */}
      <td className="px-5 py-3 hidden lg:table-cell">
        {item.expires_at ? (
          <span className={`${MONO} text-[11.5px] tabular-nums ${isExpiringSoon(item.expires_at, 30) ? 'text-amber-300' : 'text-white/55'}`}>
            {new Date(item.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        ) : (
          <span className="text-[11.5px] text-white/25">—</span>
        )}
      </td>

      {/* Auto-renew */}
      <td className="px-5 py-3 hidden xl:table-cell">
        {item.auto_renew !== null ? (
          <span className={`${MONO} text-[11px] uppercase tracking-[0.08em] ${item.auto_renew ? 'text-emerald-400' : 'text-white/35'}`}>
            {item.auto_renew ? 'On' : 'Off'}
          </span>
        ) : (
          <span className="text-[11px] text-white/25">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-5 py-3 text-right">
        <Link
          href={`/dashboard/domains/${encodeURIComponent(item.domain)}`}
          className="inline-flex h-7 w-7 items-center justify-center text-white/25 hover:text-[#0095FF] transition-colors"
          title="Manage"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}

/* ── Empty state ── */
function EmptyState({ message, isFiltered }: { message: string; isFiltered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-12 w-12 mb-4 inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]" style={{ color: ACCENT }}>
        <Globe className="h-5 w-5" />
      </div>
      <p className="text-[15px] font-semibold text-white">{message}</p>
      {!isFiltered && (
        <>
          <p className={`${MONO} mt-2 max-w-sm text-[11.5px] text-white/45 leading-relaxed`}>
            Register a new domain or connect one you already own.
          </p>
          <Link
            href="/dashboard/domains/marketplace"
            className={`${MONO} mt-5 inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px]`}
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: '#fff', boxShadow: '0 8px 20px rgba(0,149,255,0.20)' }}
          >
            <Search className="h-3.5 w-3.5" /> Search domains
          </Link>
        </>
      )}
    </div>
  );
}

/* ── Main ── */
type FilterKey = 'all' | 'attention' | 'expiring';

export default function DomainsDashboardPage() {
  const [items, setItems] = useState<DomainInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/domains/inventory');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to load domains');
      setItems((data?.data?.domains || []) as DomainInventoryItem[]);
    } catch (err) {
      console.error('Failed to load domains dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load domains dashboard');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const attentionItems = useMemo(() => items.filter(needsAttention), [items]);
  const expiringSoonItems = useMemo(() => items.filter((item) => isExpiringSoon(item.expires_at, 30)), [items]);
  const activeCount = useMemo(() => items.filter((item) => item.connections.some((c) => c.status === 'active')).length, [items]);

  const rows = filter === 'attention' ? attentionItems : filter === 'expiring' ? expiringSoonItems : items;
  const emptyMessage =
    filter === 'attention' ? 'No domains need attention' : filter === 'expiring' ? 'No domains expiring in the next 30 days' : 'No domains yet';

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) => item.domain.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]" style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)' }} />
        <div className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]" style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)', backgroundSize: '28px 28px' }} />
      </div>

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        {/* Hero */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-9">
          <div className="max-w-3xl">
            <div className={`${MONO} mb-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
              <span className="h-px w-4 bg-white/45" /> Account · Domains
            </div>
            <h1 className="text-[34px] sm:text-[42px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
              Your <span style={{ ...SERIF_STYLE, color: ACCENT }} className="font-normal">domains</span>
            </h1>
            <p className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}>
              Manage purchased and connected domains, DNS, and SSL across your account.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadDomains()}
              disabled={loading}
              className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <Link
              href="/dashboard/domains/transfer"
              className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
            >
              Transfer
            </Link>
            <Link
              href="/dashboard/domains/marketplace"
              className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
              style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: '#fff', boxShadow: '0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`; e.currentTarget.style.transform = 'none'; }}
            >
              <Plus className="h-3.5 w-3.5" /> Register domain
            </Link>
          </div>
        </header>

        {/* Stats */}
        {!loading && items.length > 0 && (
          <section className="mb-7 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Total" value={String(items.length)} hint={`${items.length} in your account`} />
            <StatTile label="Active" value={String(activeCount)} hint="Serving traffic" tone="green" />
            <StatTile label="Needs attention" value={String(attentionItems.length)} hint={attentionItems.length ? 'Action required' : 'All healthy'} tone={attentionItems.length ? 'red' : undefined} />
            <StatTile label="Expiring" value={String(expiringSoonItems.length)} hint="Within 30 days" tone={expiringSoonItems.length ? 'amber' : undefined} />
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="mb-5 flex items-center gap-2.5 border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[12.5px] text-red-200 rounded-[6px]">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Filter chips + search */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={items.length}>All</FilterChip>
            <FilterChip active={filter === 'attention'} onClick={() => setFilter('attention')} count={attentionItems.length} dot={STATUS_COLOR.attention}>Needs attention</FilterChip>
            <FilterChip active={filter === 'expiring'} onClick={() => setFilter('expiring')} count={expiringSoonItems.length} dot={STATUS_COLOR.pending}>Expiring</FilterChip>
          </div>
          <div className="flex w-full sm:w-72 items-center gap-2 border border-white/[0.08] bg-[#0d0e11] px-3 h-9 rounded-[5px]">
            <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter domains…"
              className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`${MONO} text-left text-[10px] uppercase tracking-[0.14em] text-white/40 bg-white/[0.015]`}>
                  <th className="px-5 py-2.5 font-semibold">Domain</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold hidden lg:table-cell">Connections</th>
                  <th className="px-5 py-2.5 font-semibold hidden lg:table-cell">Expires</th>
                  <th className="px-5 py-2.5 font-semibold hidden xl:table-cell">Auto-renew</th>
                  <th className="px-5 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLS}>
                      <EmptyState message={searchQuery ? 'No domains match your search' : emptyMessage} isFiltered={!!searchQuery} />
                    </td>
                  </tr>
                ) : (
                  groupDomains(filtered).map((group) => (
                    <Fragment key={group.rootDomain}>
                      {group.root ? (
                        <DomainRow item={group.root} />
                      ) : (
                        <tr className="border-t border-white/[0.04]">
                          <td className="px-5 py-2.5">
                            <span className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/30`}>{group.rootDomain}</span>
                          </td>
                          <td colSpan={COLS - 1} />
                        </tr>
                      )}
                      {group.children.map((child) => (
                        <DomainRow key={child.domain} item={child} parentDomain={group.rootDomain} />
                      ))}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'amber' | 'red' }) {
  const dot = tone === 'green' ? '#4ade80' : tone === 'amber' ? '#fbbf24' : tone === 'red' ? '#f87171' : 'rgba(255,255,255,0.55)';
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1 w-1 rounded-full shrink-0" style={{ background: dot, boxShadow: dot.startsWith('rgba') ? 'none' : `0 0 5px ${dot}` }} />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>{label}</span>
      </div>
      <span style={SERIF_STYLE} className="text-[34px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white">{value}</span>
      {hint && <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{hint}</p>}
    </div>
  );
}

function FilterChip({ active, onClick, count, children, dot }: { active?: boolean; onClick: () => void; count: number; children: React.ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MONO} inline-flex items-center gap-1.5 h-8 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] border transition-colors`}
      style={
        active
          ? { color: ACCENT, borderColor: 'rgba(0,149,255,0.4)', background: ACCENT_DIM }
          : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.08)', background: '#111216' }
      }
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot, boxShadow: `0 0 5px ${dot}` }} />}
      <span>{children}</span>
      <span className="tabular-nums" style={{ color: active ? ACCENT : 'rgba(255,255,255,0.35)' }}>{count}</span>
    </button>
  );
}
