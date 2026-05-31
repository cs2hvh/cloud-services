'use client';

// Virtual Servers list — editorial canvas (aurora + dotted grid),
// Nunito-accent title, mono labels, brand-blue accent, rounded-[6px]
// surfaces. Hero + stats strip + filter chips + proper table with
// column headers, flagcdn flag images, and a 3-dot action menu per
// row.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ArrowUpRight,
    Copy,
    HardDrive,
    Loader2,
    MapPin,
    MoreHorizontal,
    Plus,
    Power,
    PowerOff,
    RefreshCw,
    RotateCw,
    Search,
    Terminal as TerminalIcon,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { ServerStackIcon } from '@/components/dashboard/compute/vps/section-icons';
import { OsImg } from '@/components/dashboard/compute/vps/os-icons';

// ─── Design tokens ─────────────────────────────────────────────────

const SERIF_STYLE: React.CSSProperties = {
    fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';
const ACCENT_DIM = 'rgba(0,149,255,0.08)';

interface ProvisioningInfo {
    stage: string;
    progress: number;
    message: string;
    started_at?: string;
    completed_at?: string;
    failed_at?: string;
}

interface ServerData {
    id: number;
    name: string;
    ip: string;
    os: string;
    cpu_cores: number;
    memory_mb: number;
    disk_gb: number;
    status: string;
    hourly_cost: number;
    created_at: string;
    location: string | null;
    plan_slug?: string | null;
    tier?: string | null;
    details?: { provisioning?: ProvisioningInfo } | null;
}

type PowerAction = 'start' | 'stop' | 'reboot';

const STATUS_META: Record<
    string,
    { dot: string; color: string; label: string; pulse?: boolean }
> = {
    running:      { dot: '#4ade80', color: '#4ade80', label: 'Running', pulse: true },
    provisioning: { dot: ACCENT,    color: ACCENT,    label: 'Deploying', pulse: true },
    stopped:      { dot: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.6)', label: 'Stopped' },
    suspended:    { dot: '#fbbf24', color: '#fbbf24', label: 'Suspended' },
    failed:       { dot: '#f87171', color: '#f87171', label: 'Failed' },
    error:        { dot: '#f87171', color: '#f87171', label: 'Error' },
};

// ─── Region / flag (flagcdn images — emoji flags don't render on Win) ─

interface RegionInfo {
    countryCode: string | null; // ISO alpha-2 for flagcdn
    city: string;
    country: string;
}

const REGION_MAP: Record<string, RegionInfo> = {
    // Germany
    de:       { countryCode: 'de', city: 'Frankfurt',  country: 'Germany' },
    germany:  { countryCode: 'de', city: 'Frankfurt',  country: 'Germany' },
    fra:      { countryCode: 'de', city: 'Frankfurt',  country: 'Germany' },
    frankfurt:{ countryCode: 'de', city: 'Frankfurt',  country: 'Germany' },
    // France
    fr:       { countryCode: 'fr', city: 'Paris',      country: 'France' },
    france:   { countryCode: 'fr', city: 'Paris',      country: 'France' },
    par:      { countryCode: 'fr', city: 'Paris',      country: 'France' },
    paris:    { countryCode: 'fr', city: 'Paris',      country: 'France' },
    // UK
    uk:       { countryCode: 'gb', city: 'London',     country: 'United Kingdom' },
    gb:       { countryCode: 'gb', city: 'London',     country: 'United Kingdom' },
    britain:  { countryCode: 'gb', city: 'London',     country: 'United Kingdom' },
    london:   { countryCode: 'gb', city: 'London',     country: 'United Kingdom' },
    lon:      { countryCode: 'gb', city: 'London',     country: 'United Kingdom' },
    // Netherlands
    nl:       { countryCode: 'nl', city: 'Amsterdam',  country: 'Netherlands' },
    netherlands:{ countryCode: 'nl', city: 'Amsterdam', country: 'Netherlands' },
    ams:      { countryCode: 'nl', city: 'Amsterdam',  country: 'Netherlands' },
    // Ireland
    ie:       { countryCode: 'ie', city: 'Dublin',     country: 'Ireland' },
    ireland:  { countryCode: 'ie', city: 'Dublin',     country: 'Ireland' },
    dub:      { countryCode: 'ie', city: 'Dublin',     country: 'Ireland' },
    // Poland
    pl:       { countryCode: 'pl', city: 'Warsaw',     country: 'Poland' },
    poland:   { countryCode: 'pl', city: 'Warsaw',     country: 'Poland' },
    waw:      { countryCode: 'pl', city: 'Warsaw',     country: 'Poland' },
    // Italy
    it:       { countryCode: 'it', city: 'Milan',      country: 'Italy' },
    italy:    { countryCode: 'it', city: 'Milan',      country: 'Italy' },
    mil:      { countryCode: 'it', city: 'Milan',      country: 'Italy' },
    // Spain
    es:       { countryCode: 'es', city: 'Madrid',     country: 'Spain' },
    spain:    { countryCode: 'es', city: 'Madrid',     country: 'Spain' },
    mad:      { countryCode: 'es', city: 'Madrid',     country: 'Spain' },
    // USA
    us:       { countryCode: 'us', city: 'USA',        country: 'United States' },
    usa:      { countryCode: 'us', city: 'USA',        country: 'United States' },
    east:     { countryCode: 'us', city: 'US East',    country: 'United States' },
    west:     { countryCode: 'us', city: 'US West',    country: 'United States' },
    central:  { countryCode: 'us', city: 'US Central', country: 'United States' },
    nyc:      { countryCode: 'us', city: 'New York',   country: 'United States' },
    sfo:      { countryCode: 'us', city: 'San Francisco', country: 'United States' },
    lax:      { countryCode: 'us', city: 'Los Angeles',country: 'United States' },
    dal:      { countryCode: 'us', city: 'Dallas',     country: 'United States' },
    chi:      { countryCode: 'us', city: 'Chicago',    country: 'United States' },
    sea:      { countryCode: 'us', city: 'Seattle',    country: 'United States' },
    mia:      { countryCode: 'us', city: 'Miami',      country: 'United States' },
    // Canada
    ca:       { countryCode: 'ca', city: 'Toronto',    country: 'Canada' },
    canada:   { countryCode: 'ca', city: 'Toronto',    country: 'Canada' },
    tor:      { countryCode: 'ca', city: 'Toronto',    country: 'Canada' },
    mtl:      { countryCode: 'ca', city: 'Montreal',   country: 'Canada' },
    // India
    in:       { countryCode: 'in', city: 'Bangalore',  country: 'India' },
    india:    { countryCode: 'in', city: 'Bangalore',  country: 'India' },
    blr:      { countryCode: 'in', city: 'Bangalore',  country: 'India' },
    bangalore:{ countryCode: 'in', city: 'Bangalore',  country: 'India' },
    bom:      { countryCode: 'in', city: 'Mumbai',     country: 'India' },
    mumbai:   { countryCode: 'in', city: 'Mumbai',     country: 'India' },
    del:      { countryCode: 'in', city: 'Delhi',      country: 'India' },
    delhi:    { countryCode: 'in', city: 'Delhi',      country: 'India' },
    hyd:      { countryCode: 'in', city: 'Hyderabad',  country: 'India' },
    maa:      { countryCode: 'in', city: 'Chennai',    country: 'India' },
    // Singapore
    sg:       { countryCode: 'sg', city: 'Singapore',  country: 'Singapore' },
    singapore:{ countryCode: 'sg', city: 'Singapore',  country: 'Singapore' },
    sin:      { countryCode: 'sg', city: 'Singapore',  country: 'Singapore' },
    // Japan
    jp:       { countryCode: 'jp', city: 'Tokyo',      country: 'Japan' },
    japan:    { countryCode: 'jp', city: 'Tokyo',      country: 'Japan' },
    tok:      { countryCode: 'jp', city: 'Tokyo',      country: 'Japan' },
    tokyo:    { countryCode: 'jp', city: 'Tokyo',      country: 'Japan' },
    tyo:      { countryCode: 'jp', city: 'Tokyo',      country: 'Japan' },
    // Australia
    au:       { countryCode: 'au', city: 'Sydney',     country: 'Australia' },
    australia:{ countryCode: 'au', city: 'Sydney',     country: 'Australia' },
    syd:      { countryCode: 'au', city: 'Sydney',     country: 'Australia' },
    sydney:   { countryCode: 'au', city: 'Sydney',     country: 'Australia' },
    mel:      { countryCode: 'au', city: 'Melbourne',  country: 'Australia' },
    // Brazil
    br:       { countryCode: 'br', city: 'São Paulo',  country: 'Brazil' },
    brazil:   { countryCode: 'br', city: 'São Paulo',  country: 'Brazil' },
    sao:      { countryCode: 'br', city: 'São Paulo',  country: 'Brazil' },
    gru:      { countryCode: 'br', city: 'São Paulo',  country: 'Brazil' },
    // UAE
    ae:       { countryCode: 'ae', city: 'Dubai',      country: 'United Arab Emirates' },
    uae:      { countryCode: 'ae', city: 'Dubai',      country: 'United Arab Emirates' },
    dxb:      { countryCode: 'ae', city: 'Dubai',      country: 'United Arab Emirates' },
    dubai:    { countryCode: 'ae', city: 'Dubai',      country: 'United Arab Emirates' },
    // South Africa
    za:       { countryCode: 'za', city: 'Johannesburg', country: 'South Africa' },
    jnb:      { countryCode: 'za', city: 'Johannesburg', country: 'South Africa' },
};

function regionFor(opts: {
    region?: string | null;
    displayRegion?: string | null;
    fallback?: string | null;
}): RegionInfo {
    const sources = [opts.region, opts.displayRegion, opts.fallback]
        .filter((s): s is string => !!s && s.trim().length > 0);

    for (const source of sources) {
        const tokens = source.toLowerCase().split(/[-_/\s]+/).filter(Boolean);
        for (const token of [...tokens].reverse()) {
            if (/^\d+$/.test(token)) continue;
            if (REGION_MAP[token]) return REGION_MAP[token];
        }
    }
    const label = opts.displayRegion || opts.region || '—';
    return { countryCode: null, city: label, country: '—' };
}

function FlagImg({ code, size = 16 }: { code: string | null; size?: number }) {
    if (!code) {
        return (
            <MapPin
                className="text-white/40"
                style={{ width: size, height: size }}
            />
        );
    }
    const w = size;
    const h = Math.round(size * (2 / 3));
    return (
        <Image
            src={`https://flagcdn.com/${size * 2}x${h * 2}/${code}.png`}
            alt=""
            width={w}
            height={h}
            className="rounded-sm object-cover shrink-0"
            style={{ width: w, height: h }}
            unoptimized
        />
    );
}

interface HostRegionRow {
    id: string;
    name: string | null;
    region: string | null;
    display_region: string | null;
}

// ─── Page ──────────────────────────────────────────────────────────

export default function VPSPage() {
    const [servers, setServers] = useState<ServerData[]>([]);
    const [hostRegions, setHostRegions] = useState<Map<string, HostRegionRow>>(new Map());
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'running' | 'stopped' | 'provisioning' | 'failed'
    >('all');
    const [query, setQuery] = useState('');
    const supabase = useMemo(() => createClient(), []);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        let alive = true;
        // Region/flag data is resolved server-side (proxmox_hosts is admin-only
        // under RLS; the API exposes just id/name/region/display_region).
        fetch('/api/services/compute/host-regions')
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                if (!json?.ok || !Array.isArray(json.regions)) return;
                const m = new Map<string, HostRegionRow>();
                for (const row of json.regions as HostRegionRow[]) {
                    m.set(String(row.id), row);
                }
                setHostRegions(m);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);

    const loadServers = useCallback(async () => {
        setLoading(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) {
                setServers([]);
                return;
            }
            const { data, error } = await supabase
                .from('servers')
                .select(
                    'id, name, ip, os, cpu_cores, memory_mb, disk_gb, status, hourly_cost, created_at, details, location, plan_slug, tier',
                )
                .eq('owner_id', userData.user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setServers((data ?? []) as ServerData[]);
        } catch (err) {
            console.error('[loadServers]', err);
            toast.error('Unable to load your servers. Please refresh the page.');
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        loadServers().catch(() => {});
        const channel = supabase
            .channel('servers-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'servers' },
                (payload) => {
                    const newRow = payload.new as ServerData | undefined;
                    const oldRow = payload.old as { id?: number } | undefined;
                    setServers((prev) => {
                        if (payload.eventType === 'INSERT' && newRow) {
                            if (prev.some((s) => s.id === newRow.id))
                                return prev.map((s) =>
                                    s.id === newRow.id ? newRow : s,
                                );
                            return [newRow, ...prev];
                        }
                        if (payload.eventType === 'UPDATE' && newRow) {
                            return prev.map((s) =>
                                s.id === newRow.id ? newRow : s,
                            );
                        }
                        if (payload.eventType === 'DELETE' && oldRow?.id) {
                            return prev.filter((s) => s.id !== oldRow.id);
                        }
                        return prev;
                    });
                },
            )
            .subscribe();
        channelRef.current = channel;
        return () => {
            channel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const counts = useMemo(() => {
        const c = { all: servers.length, running: 0, stopped: 0, provisioning: 0, failed: 0 };
        for (const s of servers) {
            if (s.status === 'running') c.running++;
            else if (s.status === 'stopped') c.stopped++;
            else if (s.status === 'provisioning') c.provisioning++;
            else if (s.status === 'failed' || s.status === 'error') c.failed++;
        }
        return c;
    }, [servers]);

    const totals = useMemo(() => {
        const regions = new Set<string>();
        for (const s of servers) {
            const host = s.location ? hostRegions.get(s.location) : undefined;
            const r = regionFor({
                region: host?.region,
                displayRegion: host?.display_region,
                fallback: host?.name ?? s.location,
            });
            if (r.country !== '—') regions.add(r.country);
        }
        return {
            cpu: servers.reduce((sum, s) => sum + (s.cpu_cores || 0), 0),
            memGb: Math.round(
                servers.reduce((sum, s) => sum + (s.memory_mb || 0), 0) / 1024,
            ),
            diskGb: servers.reduce((sum, s) => sum + (s.disk_gb || 0), 0),
            regions: regions.size,
        };
    }, [servers, hostRegions]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return servers.filter((s) => {
            if (statusFilter !== 'all') {
                if (statusFilter === 'failed') {
                    if (s.status !== 'failed' && s.status !== 'error') return false;
                } else if (s.status !== statusFilter) {
                    return false;
                }
            }
            if (!q) return true;
            return (
                s.name.toLowerCase().includes(q) ||
                (s.ip || '').toLowerCase().includes(q) ||
                (s.os || '').toLowerCase().includes(q) ||
                (s.plan_slug || '').toLowerCase().includes(q) ||
                (s.location || '').toLowerCase().includes(q)
            );
        });
    }, [servers, statusFilter, query]);

    return (
        <div className="relative min-h-full bg-[#08090b] text-white">
            {/* Background layer */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div
                    className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
                    style={{
                        background:
                            'radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)',
                    }}
                />
                <div
                    className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
                    style={{
                        background:
                            'radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)',
                    }}
                />
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)',
                        backgroundSize: '28px 28px',
                    }}
                />
            </div>

            <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
                {/* Hero */}
                <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-10">
                    <div className="max-w-3xl">
                        <div
                            className={`${MONO} mb-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}
                        >
                            <span className="h-px w-4 bg-white/45" />
                            Compute · Virtual Servers
                        </div>
                        <h1 className="text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
                            Your{' '}
                            <span
                                style={SERIF_STYLE}
                                className="text-[#0095FF] font-normal"
                            >
                                servers
                            </span>
                        </h1>
                        <p
                            className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}
                        >
                            Provision, power-cycle, and monitor your VMs.
                            Per-second billing, dedicated cores on request.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={loadServers}
                            disabled={loading}
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
                        >
                            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <Link
                            href="/dashboard/services/compute/images"
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            <HardDrive className="h-3 w-3" />
                            Images
                        </Link>
                        <Link
                            href="/dashboard/services/compute/vps/new"
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                            style={{
                                background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                                color: '#ffffff',
                                boxShadow:
                                    '0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT_BRIGHT}, ${ACCENT})`;
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            New server
                        </Link>
                    </div>
                </header>

                {/* Stats strip */}
                <section className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile
                        label="Total"
                        value={String(counts.all)}
                        hint={`${counts.running} running · ${counts.stopped} stopped`}
                    />
                    <StatTile
                        label="vCPU"
                        value={String(totals.cpu)}
                        hint="Aggregate cores"
                        tone="blue"
                    />
                    <StatTile
                        label="Memory"
                        value={`${totals.memGb}`}
                        suffix="GB"
                        hint={`${totals.diskGb} GB storage`}
                    />
                    <StatTile
                        label="Regions"
                        value={String(totals.regions)}
                        hint={totals.regions === 1 ? 'Datacenter' : 'Datacenters'}
                        tone="green"
                    />
                </section>

                {/* Filter + search bar */}
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <FilterChip
                            active={statusFilter === 'all'}
                            onClick={() => setStatusFilter('all')}
                            count={counts.all}
                        >
                            All
                        </FilterChip>
                        <FilterChip
                            active={statusFilter === 'running'}
                            onClick={() => setStatusFilter('running')}
                            count={counts.running}
                            dot="#4ade80"
                        >
                            Running
                        </FilterChip>
                        <FilterChip
                            active={statusFilter === 'provisioning'}
                            onClick={() => setStatusFilter('provisioning')}
                            count={counts.provisioning}
                            dot={ACCENT}
                        >
                            Deploying
                        </FilterChip>
                        <FilterChip
                            active={statusFilter === 'stopped'}
                            onClick={() => setStatusFilter('stopped')}
                            count={counts.stopped}
                            dot="rgba(255,255,255,0.3)"
                        >
                            Stopped
                        </FilterChip>
                        {counts.failed > 0 && (
                            <FilterChip
                                active={statusFilter === 'failed'}
                                onClick={() => setStatusFilter('failed')}
                                count={counts.failed}
                                dot="#f87171"
                            >
                                Failed
                            </FilterChip>
                        )}
                    </div>

                    <div className="flex w-full sm:w-72 items-center gap-2 border border-white/[0.08] bg-[#0d0e11] px-3 h-9 rounded-[5px]">
                        <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search name, IP, OS…"
                            className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
                        />
                    </div>
                </div>

                {/* Table */}
                <section>
                    {loading && servers.length === 0 ? (
                        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-[60px] border-b border-white/[0.04] last:border-b-0 animate-pulse bg-white/[0.015]"
                                    style={{ animationDelay: `${i * 80}ms` }}
                                />
                            ))}
                        </div>
                    ) : servers.length === 0 ? (
                        <EmptyState />
                    ) : filtered.length === 0 ? (
                        <div className="border border-dashed border-white/[0.1] bg-[#111216] rounded-[6px] px-6 py-12 text-center">
                            <p className="text-[14px] font-semibold text-white">
                                No servers match this filter
                            </p>
                            <p
                                className={`${MONO} mt-2 text-[11px] text-white/45`}
                            >
                                Try a different status or clear your search.
                            </p>
                        </div>
                    ) : (
                        <ServerTable
                            servers={filtered}
                            onRefresh={loadServers}
                            hostRegions={hostRegions}
                        />
                    )}
                </section>
            </div>
        </div>
    );
}

// ─── Subcomponents ────────────────────────────────────────────────

function StatTile({
    label,
    value,
    suffix,
    hint,
    tone,
}: {
    label: string;
    value: string;
    suffix?: string;
    hint?: string;
    tone?: 'blue' | 'green';
}) {
    const accentColor =
        tone === 'blue'
            ? ACCENT
            : tone === 'green'
              ? '#4ade80'
              : 'rgba(255,255,255,0.55)';
    return (
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span
                    className="h-1 w-1 rounded-full shrink-0"
                    style={{
                        background: accentColor,
                        boxShadow:
                            accentColor === 'rgba(255,255,255,0.55)'
                                ? 'none'
                                : `0 0 5px ${accentColor}`,
                    }}
                />
                <span
                    className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}
                >
                    {label}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span
                    style={SERIF_STYLE}
                    className="text-[36px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white"
                >
                    {value}
                </span>
                {suffix && (
                    <span
                        style={SERIF_STYLE}
                        className="text-[15px] text-white/40 font-medium"
                    >
                        {suffix}
                    </span>
                )}
            </div>
            {hint && (
                <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>
                    {hint}
                </p>
            )}
        </div>
    );
}

function FilterChip({
    active,
    onClick,
    count,
    children,
    dot,
}: {
    active?: boolean;
    onClick: () => void;
    count: number;
    children: React.ReactNode;
    dot?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${MONO} inline-flex items-center gap-1.5 h-8 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] border transition-colors`}
            style={
                active
                    ? {
                          color: ACCENT,
                          borderColor: 'rgba(0,149,255,0.4)',
                          background: ACCENT_DIM,
                      }
                    : {
                          color: 'rgba(255,255,255,0.55)',
                          borderColor: 'rgba(255,255,255,0.08)',
                          background: '#111216',
                      }
            }
        >
            {dot && (
                <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                        background: dot,
                        boxShadow: dot.startsWith('rgba(255')
                            ? 'none'
                            : `0 0 5px ${dot}`,
                    }}
                />
            )}
            <span>{children}</span>
            <span
                className="tabular-nums"
                style={{
                    color: active ? ACCENT : 'rgba(255,255,255,0.35)',
                }}
            >
                {count}
            </span>
        </button>
    );
}

function ColHead({
    children,
    align = 'left',
}: {
    children: React.ReactNode;
    align?: 'left' | 'right';
}) {
    return (
        <span
            className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${
                align === 'right' ? 'text-right' : ''
            }`}
        >
            {children}
        </span>
    );
}

function ServerTable({
    servers,
    onRefresh,
    hostRegions,
}: {
    servers: ServerData[];
    onRefresh: () => void;
    hostRegions: Map<string, HostRegionRow>;
}) {
    return (
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
            {/* Column header (desktop only) */}
            <div className="hidden md:grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_72px] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
                <ColHead>Server</ColHead>
                <ColHead>Region</ColHead>
                <ColHead>Status</ColHead>
                <ColHead>IP</ColHead>
                <ColHead>Plan</ColHead>
                <ColHead align="right">Actions</ColHead>
            </div>

            {servers.map((server) => (
                <ServerRow
                    key={server.id}
                    server={server}
                    onRefresh={onRefresh}
                    host={
                        server.location
                            ? hostRegions.get(server.location)
                            : undefined
                    }
                />
            ))}
        </div>
    );
}

function ServerRow({
    server,
    onRefresh,
    host,
}: {
    server: ServerData;
    onRefresh: () => void;
    host?: HostRegionRow;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [busy, setBusy] = useState<PowerAction | 'delete' | null>(null);
    const router = useRouter();

    const isProvisioning = server.status === 'provisioning';
    const isFailed = server.status === 'failed' || server.status === 'error';
    const isRunning = server.status === 'running';
    const isStopped = server.status === 'stopped';
    const provisioning = server.details?.provisioning;
    const progress = provisioning?.progress ?? 10;
    const memGB = Math.round(server.memory_mb / 1024);
    const planLabel = server.plan_slug ?? `${server.cpu_cores}c · ${memGB}g`;
    const status =
        STATUS_META[server.status] ??
        { dot: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.45)', label: server.status };

    useEffect(() => {
        if (!menuOpen) return;
        const onDoc = () => setMenuOpen(false);
        document.addEventListener('click', onDoc);
        return () => document.removeEventListener('click', onDoc);
    }, [menuOpen]);

    const copyIp = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(server.ip);
            toast.success('IP copied');
        } catch {
            toast.error('Failed to copy');
        }
    };

    const power = async (action: PowerAction) => {
        setBusy(action);
        setMenuOpen(false);
        try {
            const res = await fetch('/api/services/compute/vms/power', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: server.id, action }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || `${action} failed`);
            toast.success(
                action === 'start'
                    ? 'Server starting'
                    : action === 'stop'
                      ? 'Server stopping'
                      : 'Server restarting',
            );
            onRefresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : `${action} failed`);
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        setMenuOpen(false);
        if (
            !confirm(
                `Delete "${server.name}"?\n\nThis action cannot be undone. The VM and its disk will be destroyed.`,
            )
        )
            return;
        setBusy('delete');
        try {
            const res = await fetch(
                `/api/services/compute/vms/${server.id}`,
                { method: 'DELETE' },
            );
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
            toast.success('Server deleted');
            onRefresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setBusy(null);
        }
    };

    const onConsole = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/dashboard/services/compute/vps/${server.id}#console`);
    };

    const region = regionFor({
        region: host?.region,
        displayRegion: host?.display_region,
        fallback: host?.name ?? server.location,
    });

    return (
        <Link
            href={`/dashboard/services/compute/vps/${server.id}`}
            className="group relative grid grid-cols-1 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_72px] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 transition-colors hover:bg-white/[0.015] items-center"
        >
            {/* Name + specs */}
            <div className="flex items-center gap-3 min-w-0">
                <div
                    className="h-9 w-9 shrink-0 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[6px] text-white/70"
                >
                    <OsImg name={server.os} size={18} className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className={`${MONO} text-[12.5px] font-semibold text-white truncate`}
                        >
                            {server.name}
                        </span>
                        {server.tier === 'dedicated' && (
                            <span
                                className={`${MONO} text-[9px] font-semibold uppercase tracking-[0.12em] border border-amber-400/25 bg-amber-400/[0.06] text-amber-300 px-1.5 py-px rounded-[3px]`}
                            >
                                Dedicated
                            </span>
                        )}
                    </div>
                    <div
                        className={`${MONO} mt-0.5 text-[10.5px] text-white/40 truncate`}
                    >
                        {server.cpu_cores}c
                        <span className="text-white/15 mx-1">·</span>
                        {memGB} GB
                        <span className="text-white/15 mx-1">·</span>
                        {server.disk_gb} GB
                        <span className="text-white/15 mx-1">·</span>
                        <span className="text-white/55">{server.os}</span>
                    </div>
                    {isProvisioning && (
                        <div className="mt-1.5 max-w-[260px]">
                            <div className="h-0.5 bg-white/[0.06] overflow-hidden rounded-full">
                                <div
                                    className="h-full transition-all duration-700"
                                    style={{
                                        width: `${progress}%`,
                                        background: ACCENT,
                                        boxShadow: `0 0 6px ${ACCENT}`,
                                    }}
                                />
                            </div>
                            <p
                                className={`${MONO} mt-1 truncate text-[10px]`}
                                style={{ color: ACCENT }}
                            >
                                {provisioning?.message}
                            </p>
                        </div>
                    )}
                    {isFailed && (
                        <p
                            className={`${MONO} mt-1 inline-flex items-center gap-1 text-[10px] text-red-400`}
                        >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {provisioning?.message ?? 'Deployment failed'}
                        </p>
                    )}
                </div>
            </div>

            {/* Region — fixed two-line block so the flag + city align
                consistently across rows whether or not a country sub-label
                is shown (single-line rows keep the same height). */}
            <div className="hidden md:flex items-center gap-2.5 min-w-0">
                <FlagImg code={region.countryCode} size={18} />
                <div className="min-w-0 leading-tight">
                    <p className="text-[12px] text-white/85 truncate leading-[1.25]">
                        {region.city}
                    </p>
                    <p
                        className={`${MONO} text-[9.5px] text-white/40 truncate uppercase tracking-[0.08em] leading-[1.25]`}
                    >
                        {region.country !== region.city && region.country !== '—'
                            ? region.country
                            : ' '}
                    </p>
                </div>
            </div>

            {/* Status */}
            <div className="hidden md:inline-flex items-center gap-1.5">
                <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${status.pulse ? 'animate-pulse' : ''}`}
                    style={{
                        background: status.dot,
                        boxShadow:
                            status.color === 'rgba(255,255,255,0.6)' ||
                            status.color === 'rgba(255,255,255,0.45)'
                                ? 'none'
                                : `0 0 5px ${status.color}`,
                    }}
                />
                <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color: status.color }}
                >
                    {status.label}
                </span>
            </div>

            {/* IP */}
            <div className="hidden md:flex items-center gap-1.5 min-w-0">
                <span
                    className={`${MONO} text-[11.5px] text-white/65 truncate`}
                >
                    {server.ip || '—'}
                </span>
                {server.ip && (
                    <button
                        onClick={copyIp}
                        className="shrink-0 text-white/20 hover:text-white/65 transition-colors"
                        title="Copy IP"
                    >
                        <Copy className="h-3 w-3" />
                    </button>
                )}
            </div>

            {/* Plan */}
            <div className="hidden md:block min-w-0">
                <span
                    className={`${MONO} text-[11px] text-white/55 truncate`}
                >
                    {planLabel}
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-1 shrink-0">
                <ActionMenu
                    open={menuOpen}
                    setOpen={setMenuOpen}
                    busy={busy}
                    isRunning={isRunning}
                    isStopped={isStopped}
                    canPowerOps={!isProvisioning && !isFailed}
                    onPower={power}
                    onDelete={remove}
                    onConsole={onConsole}
                />
                <span
                    className="hidden md:inline-flex items-center justify-center h-7 w-7 text-white/25 group-hover:text-[#0095FF] transition-colors"
                    aria-hidden
                >
                    <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </span>
            </div>

            {/* Mobile-only status row */}
            <div className="md:hidden flex items-center justify-between gap-3 col-span-1 -mt-1">
                <span
                    className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color: status.color }}
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${status.pulse ? 'animate-pulse' : ''}`}
                        style={{ background: status.dot }}
                    />
                    {status.label}
                </span>
                <span className={`${MONO} text-[10.5px] text-white/45`}>
                    {server.ip || '—'}
                </span>
            </div>
        </Link>
    );
}

function ActionMenu({
    open,
    setOpen,
    busy,
    isRunning,
    isStopped,
    canPowerOps,
    onPower,
    onDelete,
    onConsole,
}: {
    open: boolean;
    setOpen: (v: boolean) => void;
    busy: PowerAction | 'delete' | null;
    isRunning: boolean;
    isStopped: boolean;
    canPowerOps: boolean;
    onPower: (a: PowerAction) => void;
    onDelete: () => void;
    onConsole: (e: React.MouseEvent) => void;
}) {
    return (
        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(!open);
                }}
                disabled={!!busy}
                className="h-7 w-7 text-white/45 hover:bg-white/[0.06] hover:text-white inline-flex items-center justify-center transition-colors disabled:opacity-40 rounded-[4px]"
                title="Actions"
            >
                {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <MoreHorizontal className="h-4 w-4" />
                )}
            </button>
            {open && (
                <div
                    className="absolute right-0 top-9 z-20 w-44 border border-white/[0.1] bg-[#111216] rounded-[5px] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.7)] py-1"
                    role="menu"
                >
                    {canPowerOps && isStopped && (
                        <MenuItem
                            icon={
                                <Power className="h-3.5 w-3.5 text-emerald-300" />
                            }
                            onClick={(e) => {
                                e.preventDefault();
                                onPower('start');
                            }}
                        >
                            Start
                        </MenuItem>
                    )}
                    {canPowerOps && isRunning && (
                        <>
                            <MenuItem
                                icon={
                                    <RotateCw
                                        className="h-3.5 w-3.5"
                                        style={{ color: ACCENT }}
                                    />
                                }
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPower('reboot');
                                }}
                            >
                                Reboot
                            </MenuItem>
                            <MenuItem
                                icon={
                                    <PowerOff className="h-3.5 w-3.5 text-white/55" />
                                }
                                onClick={(e) => {
                                    e.preventDefault();
                                    onPower('stop');
                                }}
                            >
                                Shut down
                            </MenuItem>
                        </>
                    )}
                    {isRunning && (
                        <MenuItem
                            icon={
                                <TerminalIcon className="h-3.5 w-3.5 text-white/55" />
                            }
                            onClick={onConsole}
                        >
                            Console
                        </MenuItem>
                    )}
                    {canPowerOps && (
                        <div className="my-1 border-t border-white/[0.06]" />
                    )}
                    <MenuItem
                        icon={<Trash2 className="h-3.5 w-3.5 text-red-400/80" />}
                        onClick={(e) => {
                            e.preventDefault();
                            onDelete();
                        }}
                        danger
                    >
                        Delete
                    </MenuItem>
                </div>
            )}
        </div>
    );
}

function MenuItem({
    children,
    icon,
    onClick,
    danger,
}: {
    children: React.ReactNode;
    icon: React.ReactNode;
    onClick: (e: React.MouseEvent) => void;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left transition-colors ${
                danger
                    ? 'text-red-300/85 hover:bg-red-500/10 hover:text-red-200'
                    : 'text-white/75 hover:bg-white/[0.05] hover:text-white'
            }`}
        >
            {icon}
            {children}
        </button>
    );
}

function EmptyState() {
    return (
        <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-12 text-center overflow-hidden">
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        'radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)',
                }}
            />
            <div
                className="relative z-10 h-12 w-12 mb-5 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]"
                style={{ color: ACCENT }}
            >
                <ServerStackIcon className="h-5 w-5" />
            </div>
            <h3 className="relative z-10 text-[18px] font-semibold tracking-[-0.015em] text-white">
                No servers yet
            </h3>
            <p
                className={`${MONO} relative z-10 mt-2 max-w-sm mx-auto text-[11.5px] text-white/45 leading-relaxed`}
            >
                Spin up your first virtual machine in under a minute. Pick a
                region, choose a plan, deploy.
            </p>
            <div className="relative z-10 mt-5">
                <Link
                    href="/dashboard/services/compute/vps/new"
                    className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
                    style={{
                        background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                        color: '#ffffff',
                        boxShadow: '0 8px 20px rgba(0,149,255,0.20)',
                    }}
                >
                    <Plus className="h-3.5 w-3.5" />
                    Create your first server
                </Link>
            </div>
        </div>
    );
}
