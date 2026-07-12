'use client';

// Bare Metal — dedicated-server catalogue. Layout modelled on a real
// dedicated-server storefront (OneProvider-style): a sticky left filter rail
// + a dense, scannable list of horizontal server rows with aligned columns
// (Server · CPU · Memory · Storage · Network · Price). Editorial dark canvas,
// mono labels, Nunito serif accents, brand-blue — consistent with the VPS
// surfaces. A curated showcase of single- and dual-socket Intel Xeon / Core
// and AMD EPYC / Ryzen builds across six datacenters.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowUpRight,
    Check,
    ChevronDown,
    Cpu,
    Gauge,
    HardDrive,
    Layers,
    MemoryStick,
    Network,
    Power,
    Search,
    Server,
    ShieldCheck,
    SlidersHorizontal,
    Terminal,
    Wifi,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { RegionFlag } from '@/components/ui/region-flag';
import { createClient } from '@/lib/supabase/client';

// ─── Design tokens (shared with the VPS surfaces) ──────────────────

const SERIF_STYLE: React.CSSProperties = {
    fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';
const ACCENT_DIM = 'rgba(0,149,255,0.08)';

// ─── Taxonomy ──────────────────────────────────────────────────────

type Vendor = 'amd' | 'intel';
type CategoryKey = 'edge' | 'general' | 'compute' | 'memory' | 'storage' | 'hpc';
type FeatureKey = 'ddos' | 'ipmi' | 'raid' | 'privatenet' | 'redundantpsu' | 'gpuready';
type StockKey = 'in-stock' | 'ready-24h' | 'ready-48h';

const VENDORS: Record<Vendor, { label: string; color: string; sub: string }> = {
    amd: { label: 'AMD', color: 'rgba(255,255,255,0.5)', sub: 'EPYC · Ryzen' },
    intel: { label: 'Intel', color: 'rgba(255,255,255,0.5)', sub: 'Xeon · Core' },
};

const CATEGORIES: Record<CategoryKey, { label: string; color: string; blurb: string }> = {
    edge: { label: 'Edge', color: 'rgba(255,255,255,0.55)', blurb: 'Web & app front-ends, low-latency edge nodes' },
    general: { label: 'General Purpose', color: ACCENT, blurb: 'Balanced CPU, RAM & disk for everyday production' },
    compute: { label: 'Compute', color: '#a78bfa', blurb: 'High clock speeds for CPU-bound, single-thread work' },
    memory: { label: 'Memory', color: '#fbbf24', blurb: 'Large RAM for caches, in-memory & analytics DBs' },
    storage: { label: 'Storage', color: '#34d399', blurb: 'Dense disk for backups, media & data lakes' },
    hpc: { label: 'HPC / Virtualization', color: '#f472b6', blurb: 'Dual-socket density for clusters & many VMs' },
};

const FEATURES: Record<FeatureKey, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    ddos: { label: 'DDoS Protection', icon: ShieldCheck },
    ipmi: { label: 'IPMI / KVM', icon: Terminal },
    raid: { label: 'Hardware RAID', icon: Layers },
    privatenet: { label: 'Private Network', icon: Network },
    redundantpsu: { label: 'Redundant PSU', icon: Power },
    gpuready: { label: 'GPU-Ready', icon: Cpu },
};

const STOCK: Record<StockKey, { label: string; color: string }> = {
    'in-stock': { label: 'Available now', color: '#4ade80' },
    'ready-24h': { label: 'Available in 1 day', color: 'rgba(255,255,255,0.5)' },
    'ready-48h': { label: 'Available in 3 days', color: 'rgba(255,255,255,0.4)' },
};

// region slug → display city (flag resolved by <RegionFlag/>)
const REGION_LABEL: Record<string, string> = {
    fra: 'Frankfurt',
    ams: 'Amsterdam',
    lon: 'London',
    sgp: 'Singapore',
    bom: 'Mumbai',
    nyc: 'New York',
};

// ─── Catalogue ─────────────────────────────────────────────────────

interface BareMetalSku {
    id: string;
    name: string;
    vendor: Vendor;
    category: CategoryKey;
    cpu: {
        model: string;
        sockets: number;
        cores: number;
        threads: number;
        baseGhz: number;
        boostGhz: number;
        gen: string;
    };
    ramGb: number;
    ramType: string;
    storage: string;
    hasHdd: boolean;
    uplinkGbps: number;
    bandwidth: string;
    regions: string[];
    priceMonthly: number;
    priceWas?: number;
    stock: StockKey;
    features: FeatureKey[];
}

const SERVERS: BareMetalSku[] = [
    {
        id: 'bm-ryzen-edge',
        name: 'Edge R5',
        vendor: 'amd',
        category: 'edge',
        cpu: { model: 'AMD Ryzen 5 3600', sockets: 1, cores: 6, threads: 12, baseGhz: 3.6, boostGhz: 4.2, gen: 'Matisse' },
        ramGb: 64,
        ramType: 'DDR4 ECC',
        storage: '2 × 512 GB NVMe',
        hasHdd: false,
        uplinkGbps: 1,
        bandwidth: 'Unmetered',
        regions: ['fra', 'ams'],
        priceMonthly: 69,
        stock: 'in-stock',
        features: ['ddos', 'ipmi'],
    },
    {
        id: 'bm-core-i9',
        name: 'Velocity i9',
        vendor: 'intel',
        category: 'compute',
        cpu: { model: 'Intel Core i9-13900', sockets: 1, cores: 24, threads: 32, baseGhz: 2.0, boostGhz: 5.6, gen: 'Raptor Lake' },
        ramGb: 64,
        ramType: 'DDR5',
        storage: '2 × 1.92 TB NVMe Gen4',
        hasHdd: false,
        uplinkGbps: 1,
        bandwidth: 'Unmetered',
        regions: ['fra', 'ams', 'nyc'],
        priceMonthly: 129,
        priceWas: 149,
        stock: 'in-stock',
        features: ['ddos', 'ipmi', 'raid'],
    },
    {
        id: 'bm-ryzen-hf',
        name: 'Velocity R9',
        vendor: 'amd',
        category: 'compute',
        cpu: { model: 'AMD Ryzen 9 7950X', sockets: 1, cores: 16, threads: 32, baseGhz: 4.5, boostGhz: 5.7, gen: 'Zen 4' },
        ramGb: 128,
        ramType: 'DDR5 ECC',
        storage: '2 × 1.92 TB NVMe Gen4',
        hasHdd: false,
        uplinkGbps: 1,
        bandwidth: 'Unmetered',
        regions: ['fra', 'ams', 'sgp'],
        priceMonthly: 189,
        stock: 'in-stock',
        features: ['ddos', 'ipmi', 'raid'],
    },
    {
        id: 'bm-xeon-e2388g',
        name: 'Xeon E-23',
        vendor: 'intel',
        category: 'edge',
        cpu: { model: 'Intel Xeon E-2388G', sockets: 1, cores: 8, threads: 16, baseGhz: 3.2, boostGhz: 5.1, gen: 'Rocket Lake' },
        ramGb: 64,
        ramType: 'DDR4 ECC',
        storage: '2 × 1.92 TB NVMe',
        hasHdd: false,
        uplinkGbps: 1,
        bandwidth: 'Unmetered',
        regions: ['fra', 'ams', 'nyc'],
        priceMonthly: 199,
        stock: 'in-stock',
        features: ['ddos', 'ipmi', 'raid'],
    },
    {
        id: 'bm-epyc-7313',
        name: 'EPYC GP-16',
        vendor: 'amd',
        category: 'general',
        cpu: { model: 'AMD EPYC 7313', sockets: 1, cores: 16, threads: 32, baseGhz: 3.0, boostGhz: 3.7, gen: 'Milan' },
        ramGb: 128,
        ramType: 'DDR4 ECC',
        storage: '2 × 1.92 TB NVMe',
        hasHdd: false,
        uplinkGbps: 10,
        bandwidth: '50 TB',
        regions: ['fra', 'sgp', 'bom', 'nyc'],
        priceMonthly: 329,
        priceWas: 379,
        stock: 'in-stock',
        features: ['ddos', 'ipmi', 'raid', 'privatenet', 'redundantpsu'],
    },
    {
        id: 'bm-xeon-s4314',
        name: 'Xeon GP-16',
        vendor: 'intel',
        category: 'general',
        cpu: { model: 'Intel Xeon Silver 4314', sockets: 1, cores: 16, threads: 32, baseGhz: 2.4, boostGhz: 3.4, gen: 'Ice Lake' },
        ramGb: 128,
        ramType: 'DDR4 ECC',
        storage: '2 × 1.92 TB NVMe',
        hasHdd: false,
        uplinkGbps: 10,
        bandwidth: '50 TB',
        regions: ['fra', 'sgp', 'bom', 'nyc'],
        priceMonthly: 359,
        stock: 'in-stock',
        features: ['ddos', 'ipmi', 'raid', 'privatenet'],
    },
    {
        id: 'bm-epyc-7443',
        name: 'EPYC Compute-24',
        vendor: 'amd',
        category: 'compute',
        cpu: { model: 'AMD EPYC 7443', sockets: 1, cores: 24, threads: 48, baseGhz: 2.85, boostGhz: 4.0, gen: 'Milan' },
        ramGb: 256,
        ramType: 'DDR4 ECC',
        storage: '2 × 3.84 TB NVMe',
        hasHdd: false,
        uplinkGbps: 10,
        bandwidth: '100 TB',
        regions: ['fra', 'sgp', 'nyc'],
        priceMonthly: 589,
        stock: 'ready-24h',
        features: ['ddos', 'ipmi', 'raid', 'privatenet', 'redundantpsu'],
    },
    {
        id: 'bm-storage-d12',
        name: 'Storage D-192',
        vendor: 'intel',
        category: 'storage',
        cpu: { model: 'Intel Xeon Silver 4310', sockets: 1, cores: 12, threads: 24, baseGhz: 2.1, boostGhz: 3.3, gen: 'Ice Lake' },
        ramGb: 128,
        ramType: 'DDR4 ECC',
        storage: '12 × 16 TB HDD + 2 × 1.92 TB NVMe',
        hasHdd: true,
        uplinkGbps: 10,
        bandwidth: '100 TB',
        regions: ['fra', 'nyc'],
        priceMonthly: 899,
        stock: 'ready-24h',
        features: ['raid', 'ipmi', 'redundantpsu', 'privatenet'],
    },
    {
        id: 'bm-epyc-9354',
        name: 'EPYC Genoa-32',
        vendor: 'amd',
        category: 'memory',
        cpu: { model: 'AMD EPYC 9354', sockets: 1, cores: 32, threads: 64, baseGhz: 3.25, boostGhz: 3.8, gen: 'Genoa' },
        ramGb: 384,
        ramType: 'DDR5 ECC',
        storage: '4 × 3.84 TB NVMe Gen4',
        hasHdd: false,
        uplinkGbps: 25,
        bandwidth: 'Unmetered',
        regions: ['fra', 'nyc'],
        priceMonthly: 1090,
        stock: 'ready-24h',
        features: ['ddos', 'ipmi', 'raid', 'privatenet', 'redundantpsu', 'gpuready'],
    },
    {
        id: 'bm-xeon-g6448y',
        name: 'Xeon SPR-32',
        vendor: 'intel',
        category: 'compute',
        cpu: { model: 'Intel Xeon Gold 6448Y', sockets: 1, cores: 32, threads: 64, baseGhz: 2.1, boostGhz: 4.1, gen: 'Sapphire Rapids' },
        ramGb: 256,
        ramType: 'DDR5 ECC',
        storage: '2 × 3.84 TB NVMe Gen4',
        hasHdd: false,
        uplinkGbps: 25,
        bandwidth: 'Unmetered',
        regions: ['fra', 'nyc'],
        priceMonthly: 1190,
        stock: 'ready-48h',
        features: ['ddos', 'ipmi', 'raid', 'privatenet', 'redundantpsu', 'gpuready'],
    },
    {
        id: 'bm-xeon-g6342-2s',
        name: 'Xeon Dual-48',
        vendor: 'intel',
        category: 'hpc',
        cpu: { model: '2 × Intel Xeon Gold 6342', sockets: 2, cores: 48, threads: 96, baseGhz: 2.8, boostGhz: 3.5, gen: 'Ice Lake' },
        ramGb: 512,
        ramType: 'DDR4 ECC',
        storage: '4 × 3.84 TB NVMe',
        hasHdd: false,
        uplinkGbps: 25,
        bandwidth: 'Unmetered',
        regions: ['fra', 'sgp', 'nyc'],
        priceMonthly: 1490,
        stock: 'ready-48h',
        features: ['ddos', 'ipmi', 'raid', 'privatenet', 'redundantpsu', 'gpuready'],
    },
    {
        id: 'bm-epyc-9654-2s',
        name: 'EPYC Dual-192',
        vendor: 'amd',
        category: 'hpc',
        cpu: { model: '2 × AMD EPYC 9654', sockets: 2, cores: 192, threads: 384, baseGhz: 2.4, boostGhz: 3.7, gen: 'Genoa' },
        ramGb: 1536,
        ramType: 'DDR5 ECC',
        storage: '8 × 7.68 TB NVMe Gen4',
        hasHdd: false,
        uplinkGbps: 25,
        bandwidth: 'Unmetered',
        regions: ['fra', 'nyc'],
        priceMonthly: 3990,
        stock: 'ready-48h',
        features: ['ddos', 'ipmi', 'raid', 'privatenet', 'redundantpsu', 'gpuready'],
    },
];

// ─── Filter option steps ───────────────────────────────────────────

type SortKey = 'price-asc' | 'price-desc' | 'cores-desc' | 'ram-desc';
const SORTS: { key: SortKey; label: string }[] = [
    { key: 'price-asc', label: 'Price · low to high' },
    { key: 'price-desc', label: 'Price · high to low' },
    { key: 'cores-desc', label: 'Most cores' },
    { key: 'ram-desc', label: 'Most memory' },
];

const CORE_STEPS = [
    { v: 0, label: 'Any' },
    { v: 8, label: '8+' },
    { v: 16, label: '16+' },
    { v: 32, label: '32+' },
    { v: 64, label: '64+' },
];
const RAM_STEPS = [
    { v: 0, label: 'Any' },
    { v: 64, label: '64 GB+' },
    { v: 128, label: '128 GB+' },
    { v: 256, label: '256 GB+' },
    { v: 512, label: '512 GB+' },
];
const NET_STEPS = [
    { v: 0, label: 'Any' },
    { v: 1, label: '1 Gbps+' },
    { v: 10, label: '10 Gbps+' },
    { v: 25, label: '25 Gbps' },
];
const STORAGE_OPTS = [
    { v: 'any', label: 'Any' },
    { v: 'nvme', label: 'All-NVMe' },
    { v: 'hdd', label: 'Includes HDD' },
] as const;
type StorageOpt = (typeof STORAGE_OPTS)[number]['v'];
const PRICE_BUCKETS: { key: string; label: string; test: (p: number) => boolean }[] = [
    { key: 'any', label: 'Any', test: () => true },
    { key: 'lt200', label: 'Under $200', test: (p) => p < 200 },
    { key: 'mid', label: '$200 – $500', test: (p) => p >= 200 && p < 500 },
    { key: 'high', label: '$500 – $1,500', test: (p) => p >= 500 && p < 1500 },
    { key: 'top', label: '$1,500+', test: (p) => p >= 1500 },
];

const fmt = (n: number) => n.toLocaleString('en-US');
const ramLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`);

// Clean, "normal" display name derived from the real CPU model (drops the
// vendor prefix; appends ×2 for dual-socket) instead of a marketing alias.
function modelName(cpu: BareMetalSku['cpu']): string {
    const m = cpu.model.replace(/^2 × /, '').replace(/^(AMD|Intel)\s+/i, '');
    return cpu.sockets === 2 ? `${m} ×2` : m;
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
}

const GRID = 'md:grid-cols-[minmax(168px,1.7fr)_1.05fr_0.9fr_1.5fr_0.95fr_auto]';

// ─── Page ──────────────────────────────────────────────────────────

export default function BareMetalPage() {
    const [vendors, setVendors] = useState<Set<Vendor>>(new Set());
    const [cats, setCats] = useState<Set<CategoryKey>>(new Set());
    const [regions, setRegions] = useState<Set<string>>(new Set());
    const [feats, setFeats] = useState<Set<FeatureKey>>(new Set());
    const [minCores, setMinCores] = useState(0);
    const [minRam, setMinRam] = useState(0);
    const [minNet, setMinNet] = useState(0);
    const [storage, setStorage] = useState<StorageOpt>('any');
    const [price, setPrice] = useState('any');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortKey>('price-asc');
    const [mobileFilters, setMobileFilters] = useState(false);
    const [requested, setRequested] = useState<BareMetalSku | null>(null);

    const allRegions = useMemo(() => {
        const set = new Set<string>();
        SERVERS.forEach((s) => s.regions.forEach((r) => set.add(r)));
        return [...set];
    }, []);

    const priceTest = useMemo(
        () => PRICE_BUCKETS.find((b) => b.key === price)?.test ?? (() => true),
        [price],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = SERVERS.filter((s) => {
            if (vendors.size && !vendors.has(s.vendor)) return false;
            if (cats.size && !cats.has(s.category)) return false;
            if (regions.size && !s.regions.some((r) => regions.has(r))) return false;
            if (feats.size && ![...feats].every((f) => s.features.includes(f))) return false;
            if (minCores && s.cpu.cores < minCores) return false;
            if (minRam && s.ramGb < minRam) return false;
            if (minNet && s.uplinkGbps < minNet) return false;
            if (storage === 'nvme' && s.hasHdd) return false;
            if (storage === 'hdd' && !s.hasHdd) return false;
            if (!priceTest(s.priceMonthly)) return false;
            if (q) {
                const hay = `${s.name} ${s.cpu.model} ${s.cpu.gen} ${CATEGORIES[s.category].label}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        return list.sort((a, b) => {
            switch (sort) {
                case 'price-desc':
                    return b.priceMonthly - a.priceMonthly;
                case 'cores-desc':
                    return b.cpu.cores - a.cpu.cores;
                case 'ram-desc':
                    return b.ramGb - a.ramGb;
                default:
                    return a.priceMonthly - b.priceMonthly;
            }
        });
    }, [vendors, cats, regions, feats, minCores, minRam, minNet, storage, priceTest, query, sort]);

    const activeFilters =
        vendors.size +
        cats.size +
        regions.size +
        feats.size +
        (minCores ? 1 : 0) +
        (minRam ? 1 : 0) +
        (minNet ? 1 : 0) +
        (storage !== 'any' ? 1 : 0) +
        (price !== 'any' ? 1 : 0);

    const clearAll = () => {
        setVendors(new Set());
        setCats(new Set());
        setRegions(new Set());
        setFeats(new Set());
        setMinCores(0);
        setMinRam(0);
        setMinNet(0);
        setStorage('any');
        setPrice('any');
        setQuery('');
    };

    const panel = (
        <FilterPanel
            vendors={vendors}
            setVendors={setVendors}
            cats={cats}
            setCats={setCats}
            regions={regions}
            setRegions={setRegions}
            allRegions={allRegions}
            feats={feats}
            setFeats={setFeats}
            minCores={minCores}
            setMinCores={setMinCores}
            minRam={minRam}
            setMinRam={setMinRam}
            minNet={minNet}
            setMinNet={setMinNet}
            storage={storage}
            setStorage={setStorage}
            price={price}
            setPrice={setPrice}
            activeFilters={activeFilters}
            clearAll={clearAll}
        />
    );

    return (
        <div className="relative min-h-full bg-[#08090b] text-white">
            {/* Background layer */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]" style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)' }} />
                <div className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]" style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)' }} />
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)', backgroundSize: '28px 28px' }} />
            </div>

            <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
                {/* Hero */}
                <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-7">
                    <div className="max-w-3xl">
                        <div className={`${MONO} mb-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
                            <span className="h-px w-4 bg-white/45" />
                            Compute · Bare Metal
                        </div>
                        <h1 className="text-[34px] sm:text-[42px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
                            Dedicated{' '}
                            <span style={SERIF_STYLE} className="text-[#0095FF] font-normal">
                                servers
                            </span>
                        </h1>
                        <p className={`mt-3 max-w-xl text-[13.5px] text-white/55 leading-relaxed`}>
                            Single-tenant physical servers with full root access and dedicated
                            hardware — no virtualization, no neighbours. Billed monthly.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <a
                            href="mailto:sales@ahurasense.com?subject=Bare%20Metal%20enquiry"
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Custom build
                        </a>
                        <Link
                            href="/dashboard/services/compute/vps"
                            className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
                        >
                            <Server className="h-3.5 w-3.5" />
                            Virtual servers
                        </Link>
                    </div>
                </header>

                {/* Summary line */}
                <div className={`${MONO} mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] uppercase tracking-[0.12em] text-white/40`}>
                    <span className="text-white/70">{SERVERS.length} configurations</span>
                    <Dot />
                    <span>{allRegions.length} datacenters · 3 continents</span>
                    <Dot />
                    <span>Intel &amp; AMD</span>
                    <Dot />
                    <span>up to 384 threads · 1.5 TB RAM</span>
                </div>

                {/* Body: sidebar + list */}
                <div className="flex flex-col lg:flex-row lg:gap-7">
                    {/* Sidebar (desktop) */}
                    <aside className="hidden lg:block w-[244px] shrink-0">
                        <div className="sticky top-6">{panel}</div>
                    </aside>

                    {/* Main */}
                    <div className="min-w-0 flex-1">
                        {/* Controls */}
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMobileFilters((v) => !v)}
                                    className={`${MONO} lg:hidden inline-flex h-9 items-center gap-2 px-3 rounded-[5px] border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.12em] text-white/70`}
                                >
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    Filters
                                    {activeFilters > 0 && (
                                        <span className="rounded-full px-1.5 text-[10px]" style={{ background: ACCENT, color: '#fff' }}>
                                            {activeFilters}
                                        </span>
                                    )}
                                </button>
                                <div className="flex w-full sm:w-72 items-center gap-2 border border-white/[0.08] bg-[#0d0e11] px-3 h-9 rounded-[5px]">
                                    <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                                    <input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search model, CPU, generation…"
                                        className={`${MONO} flex-1 bg-transparent text-[12px] text-white placeholder:text-white/30 outline-none`}
                                    />
                                    {query && (
                                        <button type="button" onClick={() => setQuery('')} className="text-white/40 hover:text-white">
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`${MONO} hidden sm:block text-[10.5px] uppercase tracking-[0.12em] text-white/35`}>
                                    {filtered.length} of {SERVERS.length}
                                </span>
                                <div className="relative">
                                    <select
                                        value={sort}
                                        onChange={(e) => setSort(e.target.value as SortKey)}
                                        className={`${MONO} h-9 appearance-none rounded-[5px] border border-white/[0.08] bg-[#0d0e11] pl-3 pr-9 text-[11px] uppercase tracking-[0.1em] text-white/65 outline-none hover:text-white cursor-pointer`}
                                    >
                                        {SORTS.map((s) => (
                                            <option key={s.key} value={s.key} className="bg-[#111216] text-white normal-case">
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                                </div>
                            </div>
                        </div>

                        {/* Mobile filter sheet */}
                        {mobileFilters && <div className="lg:hidden mb-4">{panel}</div>}

                        {/* Column headers (desktop) */}
                        <div className={`hidden md:grid ${GRID} items-center gap-4 px-4 pb-2`}>
                            <ColHead>Server</ColHead>
                            <ColHead>CPU</ColHead>
                            <ColHead>Memory</ColHead>
                            <ColHead>Storage</ColHead>
                            <ColHead>Network</ColHead>
                            <ColHead align="right">Price</ColHead>
                        </div>

                        {/* Rows */}
                        {filtered.length === 0 ? (
                            <div className="border border-dashed border-white/[0.1] bg-[#111216] rounded-[6px] px-6 py-14 text-center">
                                <p className="text-[14px] font-semibold text-white">No servers match these filters</p>
                                <p className={`${MONO} mt-2 text-[11px] text-white/45`}>Try widening your vendor, region, or price filters.</p>
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className={`${MONO} mt-4 inline-flex h-8 items-center px-3 rounded-[4px] border border-white/[0.1] bg-white/[0.03] text-[10.5px] uppercase tracking-[0.12em] text-white/70 hover:text-white`}
                                >
                                    Clear filters
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {filtered.map((s) => (
                                    <ServerRow key={s.id} sku={s} onConfigure={() => setRequested(s)} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {requested && <RequestModal sku={requested} onClose={() => setRequested(null)} />}
        </div>
    );
}

// ─── List primitives ───────────────────────────────────────────────

function Dot() {
    return <span className="h-1 w-1 rounded-full bg-white/20" />;
}

function ColHead({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
        <span className={`${MONO} text-[9.5px] uppercase tracking-[0.16em] text-white/35 ${align === 'right' ? 'text-right' : ''}`}>
            {children}
        </span>
    );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <span className={`${MONO} md:hidden mb-0.5 block text-[9px] uppercase tracking-[0.12em] text-white/30`}>{label}</span>
            {children}
        </div>
    );
}

function ServerRow({ sku, onConfigure }: { sku: BareMetalSku; onConfigure: () => void }) {
    const cat = CATEGORIES[sku.category];
    const v = VENDORS[sku.vendor];
    const stock = STOCK[sku.stock];
    return (
        <div className="group relative overflow-hidden rounded-[8px] border border-white/[0.07] bg-[#111216] transition-colors hover:border-[rgba(0,149,255,0.28)] hover:bg-[#13151a]">
            <div className="px-4 py-3.5 sm:px-5">
                <div className={`grid grid-cols-2 gap-x-4 gap-y-3 md:gap-y-0 ${GRID} md:items-center`}>
                    {/* Server */}
                    <div className="col-span-2 md:col-span-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                            <span className={`${MONO} text-[9px] uppercase tracking-[0.12em] text-white/40`}>
                                {cat.label}
                            </span>
                        </div>
                        <h3 className="text-[15px] leading-tight font-semibold text-white truncate">
                            {modelName(sku.cpu)}
                        </h3>
                        <p className={`${MONO} mt-0.5 text-[10.5px] text-white/45 truncate`}>
                            {v.label} · {sku.cpu.gen}
                        </p>
                    </div>

                    {/* CPU */}
                    <Cell label="CPU">
                        <div className="text-[12.5px] text-white/90 leading-tight">
                            {sku.cpu.cores}c <span className="text-white/40">/</span> {sku.cpu.threads}t
                        </div>
                        <div className={`${MONO} mt-0.5 text-[10px] text-white/40`}>{sku.cpu.baseGhz}–{sku.cpu.boostGhz} GHz</div>
                    </Cell>

                    {/* Memory */}
                    <Cell label="Memory">
                        <div className="text-[12.5px] text-white/90 leading-tight">{ramLabel(sku.ramGb)}</div>
                        <div className={`${MONO} mt-0.5 text-[10px] text-white/40`}>{sku.ramType}</div>
                    </Cell>

                    {/* Storage */}
                    <Cell label="Storage">
                        <div className="text-[12px] text-white/90 leading-tight">{sku.storage}</div>
                    </Cell>

                    {/* Network */}
                    <Cell label="Network">
                        <div className="text-[12.5px] text-white/90 leading-tight">{sku.uplinkGbps} Gbps</div>
                        <div className={`${MONO} mt-0.5 text-[10px] text-white/40`}>{sku.bandwidth}</div>
                    </Cell>

                    {/* Price + CTA */}
                    <div className="col-span-2 md:col-span-1 flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-center">
                        <div className="md:text-right">
                            <div className="flex items-baseline gap-1.5 md:justify-end">
                                {sku.priceWas && (
                                    <span className={`${MONO} text-[11px] text-white/30 line-through`}>${fmt(sku.priceWas)}</span>
                                )}
                                <span style={SERIF_STYLE} className="text-[22px] leading-none font-bold tabular-nums text-white">
                                    ${fmt(sku.priceMonthly)}
                                </span>
                                <span className={`${MONO} text-[10.5px] text-white/40`}>/mo</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onConfigure}
                            className={`${MONO} inline-flex h-9 items-center gap-1.5 px-4 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[5px] transition-all shrink-0`}
                            style={{
                                background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`,
                                color: '#fff',
                                boxShadow: '0 8px 20px rgba(0,149,255,0.20), inset 0 1px 0 rgba(255,255,255,0.15)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#ffffff';
                                e.currentTarget.style.color = '#000000';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                                e.currentTarget.style.color = '#ffffff';
                                e.currentTarget.style.transform = 'none';
                            }}
                        >
                            Request quote
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Meta line: options · regions · stock */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.05] pt-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {sku.features.map((f) => {
                            const meta = FEATURES[f];
                            const Icon = meta.icon;
                            return (
                                <span key={f} className={`${MONO} inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.06em] text-white/50`} title={meta.label}>
                                    <Icon className="h-3 w-3 text-white/40" />
                                    {meta.label}
                                </span>
                            );
                        })}
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            {sku.regions.map((r) => (
                                <span key={r} title={REGION_LABEL[r] ?? r}>
                                    <RegionFlag region={r} size={14} />
                                </span>
                            ))}
                        </span>
                        <span className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.1em]`} style={{ color: stock.color }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: stock.color, boxShadow: `0 0 5px ${stock.color}` }} />
                            {stock.label}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Filter panel ──────────────────────────────────────────────────

interface PanelProps {
    vendors: Set<Vendor>;
    setVendors: (s: Set<Vendor>) => void;
    cats: Set<CategoryKey>;
    setCats: (s: Set<CategoryKey>) => void;
    regions: Set<string>;
    setRegions: (s: Set<string>) => void;
    allRegions: string[];
    feats: Set<FeatureKey>;
    setFeats: (s: Set<FeatureKey>) => void;
    minCores: number;
    setMinCores: (n: number) => void;
    minRam: number;
    setMinRam: (n: number) => void;
    minNet: number;
    setMinNet: (n: number) => void;
    storage: StorageOpt;
    setStorage: (v: StorageOpt) => void;
    price: string;
    setPrice: (v: string) => void;
    activeFilters: number;
    clearAll: () => void;
}

function FilterPanel(p: PanelProps) {
    const vCount = (v: Vendor) => SERVERS.filter((s) => s.vendor === v).length;
    const cCount = (c: CategoryKey) => SERVERS.filter((s) => s.category === c).length;
    const rCount = (r: string) => SERVERS.filter((s) => s.regions.includes(r)).length;

    return (
        <div className="border border-white/[0.07] bg-[#0d0e11] rounded-[8px] p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className={`${MONO} flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/55`}>
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                </span>
                {p.activeFilters > 0 && (
                    <button
                        type="button"
                        onClick={p.clearAll}
                        className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] text-[#33adff] hover:text-white`}
                    >
                        Clear ({p.activeFilters})
                    </button>
                )}
            </div>

            <FilterGroup label="CPU make">
                {(Object.keys(VENDORS) as Vendor[]).map((v) => (
                    <CheckRow
                        key={v}
                        active={p.vendors.has(v)}
                        onClick={() => p.setVendors(toggle(p.vendors, v))}
                        count={vCount(v)}
                    >
                        {VENDORS[v].label}
                    </CheckRow>
                ))}
            </FilterGroup>

            <FilterGroup label="Workload">
                {(Object.keys(CATEGORIES) as CategoryKey[]).map((c) => (
                    <CheckRow
                        key={c}
                        active={p.cats.has(c)}
                        onClick={() => p.setCats(toggle(p.cats, c))}
                        count={cCount(c)}
                    >
                        {CATEGORIES[c].label}
                    </CheckRow>
                ))}
            </FilterGroup>

            <FilterGroup label="Region">
                {p.allRegions.map((r) => (
                    <CheckRow
                        key={r}
                        active={p.regions.has(r)}
                        onClick={() => p.setRegions(toggle(p.regions, r))}
                        count={rCount(r)}
                        flag={r}
                    >
                        {REGION_LABEL[r] ?? r}
                    </CheckRow>
                ))}
            </FilterGroup>

            <FilterGroup label="CPU cores">
                <SegRow options={CORE_STEPS} value={p.minCores} onChange={p.setMinCores} />
            </FilterGroup>

            <FilterGroup label="Memory">
                <SegRow options={RAM_STEPS} value={p.minRam} onChange={p.setMinRam} />
            </FilterGroup>

            <FilterGroup label="Network">
                <SegRow options={NET_STEPS} value={p.minNet} onChange={p.setMinNet} />
            </FilterGroup>

            <FilterGroup label="Storage">
                <SegRow
                    options={STORAGE_OPTS.map((o) => ({ v: o.v, label: o.label }))}
                    value={p.storage}
                    onChange={(v) => p.setStorage(v as StorageOpt)}
                />
            </FilterGroup>

            <FilterGroup label="Price / month">
                <SegRow
                    options={PRICE_BUCKETS.map((b) => ({ v: b.key, label: b.label }))}
                    value={p.price}
                    onChange={(v) => p.setPrice(String(v))}
                    stack
                />
            </FilterGroup>

            <FilterGroup label="Features" last>
                {(Object.keys(FEATURES) as FeatureKey[]).map((f) => {
                    const Icon = FEATURES[f].icon;
                    return (
                        <CheckRow
                            key={f}
                            active={p.feats.has(f)}
                            onClick={() => p.setFeats(toggle(p.feats, f))}
                            icon={<Icon className="h-3 w-3 text-white/40" />}
                        >
                            {FEATURES[f].label}
                        </CheckRow>
                    );
                })}
            </FilterGroup>
        </div>
    );
}

function FilterGroup({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
    return (
        <div className={`py-3.5 ${last ? '' : 'border-b border-white/[0.05]'}`}>
            <div className={`${MONO} mb-2.5 text-[9.5px] uppercase tracking-[0.16em] text-white/40`}>{label}</div>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function CheckRow({
    active,
    onClick,
    count,
    dot,
    flag,
    icon,
    children,
}: {
    active?: boolean;
    onClick: () => void;
    count?: number;
    dot?: string;
    flag?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-left transition-colors hover:bg-white/[0.03]"
        >
            <span
                className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[3px] border transition-colors"
                style={
                    active
                        ? { background: ACCENT, borderColor: ACCENT }
                        : { borderColor: 'rgba(255,255,255,0.18)', background: 'transparent' }
                }
            >
                {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </span>
            {dot && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />}
            {flag && <RegionFlag region={flag} size={13} />}
            {icon}
            <span className={`text-[11.5px] ${active ? 'text-white' : 'text-white/65'} truncate`}>{children}</span>
            {typeof count === 'number' && (
                <span className={`${MONO} ml-auto text-[10px] tabular-nums ${active ? 'text-[#33adff]' : 'text-white/30'}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

function SegRow<T extends string | number>({
    options,
    value,
    onChange,
    stack,
}: {
    options: { v: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    stack?: boolean;
}) {
    return (
        <div className={stack ? 'flex flex-col gap-1' : 'flex flex-wrap gap-1.5'}>
            {options.map((o) => {
                const active = o.v === value;
                return (
                    <button
                        key={String(o.v)}
                        type="button"
                        onClick={() => onChange(o.v)}
                        className={`${MONO} ${stack ? 'w-full justify-start' : ''} inline-flex items-center h-7 px-2.5 rounded-[4px] border text-[10px] uppercase tracking-[0.06em] transition-colors`}
                        style={
                            active
                                ? { color: ACCENT, borderColor: 'rgba(0,149,255,0.4)', background: ACCENT_DIM }
                                : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.08)', background: '#111216' }
                        }
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Configure / request modal ─────────────────────────────────────

function RequestModal({ sku, onClose }: { sku: BareMetalSku; onClose: () => void }) {
    const [submitting, setSubmitting] = useState(false);
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const cat = CATEGORIES[sku.category];

    // Prefill the logged-in user's email so the enquiry is one click.
    useEffect(() => {
        let alive = true;
        createClient()
            .auth.getUser()
            .then(({ data }) => {
                if (alive && data.user?.email) setEmail(data.user.email);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);

    const submit = async () => {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
            toast.error('Please enter a valid email so our team can reply.');
            return;
        }
        setSubmitting(true);
        try {
            const summary =
                `Bare-metal enquiry — ${modelName(sku.cpu)}\n` +
                `CPU: ${sku.cpu.model} (${sku.cpu.gen}) · ${sku.cpu.cores}c/${sku.cpu.threads}t · ${sku.cpu.baseGhz}–${sku.cpu.boostGhz} GHz\n` +
                `Memory: ${ramLabel(sku.ramGb)} ${sku.ramType}\n` +
                `Storage: ${sku.storage}\n` +
                `Network: ${sku.uplinkGbps} Gbps · ${sku.bandwidth}\n` +
                `Regions: ${sku.regions.map((r) => REGION_LABEL[r] ?? r).join(', ')}\n` +
                `Listed price: $${fmt(sku.priceMonthly)}/mo` +
                (message.trim() ? `\n\nNote from customer:\n${message.trim()}` : '');
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: email.split('@')[0] || 'Customer',
                    email: email.trim(),
                    topic: 'Bare Metal',
                    message: summary,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data.error || 'Could not send your enquiry.');
            toast.success('Enquiry sent to sales', {
                description: 'Our team will reply with availability, lead time, and a final quote.',
            });
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not send your enquiry. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
                className="relative z-10 w-full max-w-md border border-white/[0.1] bg-[#0d0e11] rounded-[10px] p-6 shadow-2xl max-h-[90svh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors">
                    <X className="h-4 w-4" />
                </button>

                <div className={`${MONO} mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/45`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    Bare metal · {cat.label}
                </div>
                <h2 style={SERIF_STYLE} className="text-[24px] font-semibold text-white leading-tight">
                    {modelName(sku.cpu)}
                </h2>
                <p className={`${MONO} mt-1 text-[11px] text-white/45`}>{VENDORS[sku.vendor].label} · {sku.cpu.gen}</p>

                <div className="mt-5 space-y-2.5 border border-white/[0.06] bg-[#111216] rounded-[6px] p-4">
                    <SummaryLine label="Workload" value={cat.label} />
                    <SummaryLine label="CPU" value={`${sku.cpu.cores} cores · ${sku.cpu.threads} threads · ${sku.cpu.baseGhz}–${sku.cpu.boostGhz} GHz`} />
                    <SummaryLine label="Memory" value={`${ramLabel(sku.ramGb)} ${sku.ramType}`} />
                    <SummaryLine label="Storage" value={sku.storage} />
                    <SummaryLine label="Network" value={`${sku.uplinkGbps} Gbps · ${sku.bandwidth}`} />
                    <SummaryLine label="Regions" value={sku.regions.map((r) => REGION_LABEL[r] ?? r).join(', ')} />
                    <div className="flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                        <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>From</span>
                        <span style={SERIF_STYLE} className="text-[18px] font-bold text-white tabular-nums">
                            ${fmt(sku.priceMonthly)}
                            <span className={`${MONO} ml-1 text-[11px] font-normal text-white/40`}>/mo</span>
                        </span>
                    </div>
                </div>

                {/* Enquiry fields */}
                <div className="mt-4 space-y-3">
                    <div>
                        <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.12em] text-white/45`}>Your email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            className="w-full h-10 rounded-[6px] border border-white/[0.1] bg-[#111216] px-3 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#0095FF]/55 focus:shadow-[0_0_0_3px_rgba(0,149,255,0.12)]"
                        />
                    </div>
                    <div>
                        <label className={`${MONO} mb-1.5 block text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                            Message <span className="text-white/25">(optional)</span>
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={3}
                            placeholder="Timeline, quantity, OS, customisations…"
                            className="w-full resize-none rounded-[6px] border border-white/[0.1] bg-[#111216] px-3 py-2.5 text-[13px] leading-relaxed text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#0095FF]/55 focus:shadow-[0_0_0_3px_rgba(0,149,255,0.12)]"
                        />
                    </div>
                </div>

                <div className="mt-3 flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4ade80]" />
                    <p className={`${MONO} text-[10.5px] leading-relaxed text-white/50`}>
                        No commitment — our team replies with current availability, lead time, and a final quote.
                    </p>
                </div>

                <div className="mt-5 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className={`${MONO} h-10 flex-1 rounded-[5px] border border-white/[0.1] bg-white/[0.02] text-[11px] uppercase tracking-[0.12em] text-white/65 hover:text-white transition-colors`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={submitting}
                        className={`${MONO} h-10 flex-[1.4] rounded-[5px] text-[11px] uppercase tracking-[0.12em] font-semibold transition-all disabled:opacity-60`}
                        style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: '#fff', boxShadow: '0 8px 20px rgba(0,149,255,0.2)' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.color = '#000000';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = `linear-gradient(135deg, ${ACCENT}, #0066B3)`;
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.transform = 'none';
                        }}
                    >
                        {submitting ? 'Sending…' : 'Submit enquiry'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40 shrink-0`}>{label}</span>
            <span className="text-[11.5px] text-white/85 text-right leading-tight">{value}</span>
        </div>
    );
}
