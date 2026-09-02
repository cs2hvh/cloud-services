// Canonical bare-metal lineup.
//
// Bare metal has no provider integration and no catalog table — the "order"
// button opens a contact form — so a constant IS the source of truth here. The
// point is that there is now exactly ONE of them.
//
// There were two, and they disagreed on the same silicon:
//
//   Intel Xeon E-2388G   marketing $99    dashboard $199
//   AMD Ryzen 9 7950X    marketing $179   dashboard $189
//   AMD EPYC 9354        marketing $549   dashboard $1090
//
// A visitor read $99 on /services/compute and found $199 once signed in. The
// marketing page now features a subset of this list rather than restating it.

export type Vendor = 'amd' | 'intel';
export type CategoryKey = 'edge' | 'general' | 'compute' | 'memory' | 'storage' | 'hpc';

/**
 * Product LINE, which is a different question from workload category.
 *
 * `category` answers "what is this good at" (compute, memory, storage).
 * `series` answers "which range am I shopping in" — silicon class and price
 * tier — and that is the axis every dedicated-server storefront sorts by,
 * because it is the one a buyer already has an opinion about. Somebody who
 * wants a game server knows they want high clock speed on a desktop-class
 * chip; they do not want to compare it against a dual-socket EPYC on the same
 * flat list.
 *
 * Both are kept. The list groups by series; the workload filter still cuts
 * across all of them.
 */
export type SeriesKey = 'legacy' | 'velocity' | 'scale' | 'storage' | 'density';
export type StockKey = 'in-stock' | 'ready-24h' | 'ready-48h';
export type FeatureKey = 'ddos' | 'ipmi' | 'raid' | 'privatenet' | 'redundantpsu' | 'gpuready';

/**
 * The ranges, in the order a storefront should present them: cheapest and
 * oldest first, so the price ladder reads top to bottom.
 */
export const BARE_METAL_SERIES: Record<
    SeriesKey,
    { label: string; tagline: string; blurb: string; accent: string; order: number }
> = {
    legacy: {
        label: 'Essential',
        tagline: 'Previous generation · best value',
        blurb:
            'Proven silicon a generation or two back, at the lowest price per core we offer. Web front-ends, staging environments, build agents and anything where the newest chip earns nothing.',
        accent: 'rgba(255,255,255,0.55)',
        order: 1,
    },
    velocity: {
        label: 'Velocity',
        tagline: 'Ryzen & Core · highest clock speed',
        blurb:
            'Desktop-class chips picked for single-thread speed rather than core count — the thing that actually decides frame times, checkout latency and how fast one long request finishes. Game servers, ecommerce, CI runners.',
        accent: '#a78bfa',
        order: 2,
    },
    scale: {
        label: 'Scale',
        tagline: 'EPYC & Xeon Scalable · production infrastructure',
        blurb:
            'Server silicon with ECC memory, more cores and more PCIe lanes. The default range for databases, application tiers and container hosts that have to stay up rather than merely go fast.',
        accent: '#0095FF',
        order: 3,
    },
    storage: {
        label: 'Storage',
        tagline: 'Dense disk · capacity first',
        blurb:
            'Chassis built around drive bays instead of cores. Backups, media libraries, object stores and data lakes, where the CPU exists to keep the disks busy.',
        accent: '#34d399',
        order: 4,
    },
    density: {
        label: 'Density',
        tagline: 'Dual-socket & high-memory · virtualization and HPC',
        blurb:
            'The largest machines we rack: two sockets, or one very large one, with memory measured in hundreds of gigabytes. Hypervisors carving out many VMs, in-memory analytics and HPC nodes.',
        accent: '#f472b6',
        order: 5,
    },
};

export interface BareMetalSku {
    id: string;
    name: string;
    vendor: Vendor;
    category: CategoryKey;
    series: SeriesKey;
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

export const BARE_METAL_SKUS: BareMetalSku[] = [
    {
        id: 'bm-ryzen-edge',
        name: 'Edge R5',
        vendor: 'amd',
        category: 'edge',
        series: 'legacy',
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
        series: 'velocity',
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
        series: 'velocity',
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
        series: 'legacy',
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
        series: 'scale',
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
        series: 'scale',
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
        series: 'scale',
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
        series: 'storage',
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
        series: 'density',
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
        series: 'scale',
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
        series: 'density',
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
        series: 'density',
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
