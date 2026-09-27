// The dedicated-server storefront's view of the bare-metal lineup.
//
// This does NOT hold specs or prices. It reshapes BARE_METAL_SKUS — still the
// one source of truth, for the reasons its own header sets out — into the row
// the supplied design comps draw: one line per machine, with a country to
// filter on, a raw-capacity number to sort on, and the copy the expanded
// detail panel needs.
//
// The comps were built against a supplied workbook of 50 plans
// (dedicated-servers-50-plans.xlsx) that is not in this repo, priced pre-VAT
// in eight currencies at unrounded conversion rates. Those numbers are NOT
// imported here: a second price list on a public page is exactly the drift
// that lib/catalog/bare-metal.ts exists to stop, and the homepage hero and
// compute pricing tab are both computed from that lineup. When the workbook
// becomes canonical, it replaces BARE_METAL_SKUS and this file follows.

import { BARE_METAL_SKUS, type BareMetalSku } from '@/lib/catalog/bare-metal';
import { countryCodeFor } from '@/lib/regions/country';

/** Region slug → the city and country a buyer recognises. */
const REGION_PLACE: Record<string, { city: string; country: string }> = {
    fra: { city: 'Frankfurt', country: 'Germany' },
    ams: { city: 'Amsterdam', country: 'Netherlands' },
    lon: { city: 'London', country: 'United Kingdom' },
    sgp: { city: 'Singapore', country: 'Singapore' },
    bom: { city: 'Mumbai', country: 'India' },
    nyc: { city: 'New York', country: 'United States' },
};

export interface DedicatedLocation {
    /** ISO alpha-2, upper case — the code the country filter matches on. */
    code: string;
    city: string;
    country: string;
}

export interface DedicatedRow {
    id: string;
    /** Catalogue code. The SKU's own id, so support can trace a row back. */
    code: string;
    name: string;
    /** "Intel Xeon", "AMD EPYC" — the line above the plan name. */
    brandLine: string;
    vendor: BareMetalSku['vendor'];
    cpuModel: string;
    sockets: number;
    cores: number;
    threads: number;
    baseGhz: number;
    boostGhz: number;
    ramGb: number;
    ramType: string;
    storage: string;
    /** Raw capacity in TB, summed across every drive. Sorting and filtering. */
    storageTb: number;
    uplinkGbps: number;
    bandwidth: string;
    priceMonthly: number;
    /** Where this machine is racked. First entry is the one the row shows. */
    locations: DedicatedLocation[];
    /** Every country this machine can be had in — the filter matches any. */
    countryCodes: string[];
    order: number;
}

/** "AMD EPYC 9354" → "AMD EPYC"; "Intel Core i9-13900" → "Intel Core". */
function brandLineFor(sku: BareMetalSku): string {
    const [vendor, family] = sku.cpu.model.replace(/^\d+\s*×\s*/, '').split(' ');
    return family ? `${vendor} ${family}` : vendor;
}

/**
 * Raw capacity in TB across every drive group.
 *
 * Storage reads like "12 × 16 TB HDD + 2 × 1.92 TB NVMe", so each "N × M unit"
 * term is summed rather than the first one being taken for the whole machine —
 * which would have filed a 204 TB storage box under 1.92 TB.
 */
function rawStorageTb(storage: string): number {
    let total = 0;
    for (const [, count, size, unit] of storage.matchAll(
        /(\d+)\s*×\s*([\d.]+)\s*(TB|GB)/gi,
    )) {
        total += Number(count) * Number(size) * (unit.toUpperCase() === 'GB' ? 0.001 : 1);
    }
    return Math.round(total * 100) / 100;
}

function locationsFor(sku: BareMetalSku): DedicatedLocation[] {
    return sku.regions.flatMap((region) => {
        const place = REGION_PLACE[region];
        if (!place) return [];
        const code = countryCodeFor(region, place.city, place.country);
        return code ? [{ code: code.toUpperCase(), city: place.city, country: place.country }] : [];
    });
}

export const DEDICATED_ROWS: DedicatedRow[] = BARE_METAL_SKUS.map((sku, index) => {
    const locations = locationsFor(sku);
    return {
        id: sku.id,
        code: sku.id.toUpperCase(),
        name: sku.name,
        brandLine: brandLineFor(sku),
        vendor: sku.vendor,
        cpuModel: sku.cpu.model,
        sockets: sku.cpu.sockets,
        cores: sku.cpu.cores,
        threads: sku.cpu.threads,
        baseGhz: sku.cpu.baseGhz,
        boostGhz: sku.cpu.boostGhz,
        ramGb: sku.ramGb,
        ramType: sku.ramType,
        storage: sku.storage,
        storageTb: rawStorageTb(sku.storage),
        uplinkGbps: sku.uplinkGbps,
        bandwidth: sku.bandwidth,
        priceMonthly: sku.priceMonthly,
        locations,
        countryCodes: [...new Set(locations.map((l) => l.code))],
        order: index,
    };
});

/** How many rows the landing page shows before "Show more servers". */
export const PREVIEW_ROWS = 10;

export interface CountryOption {
    code: string;
    name: string;
}

/**
 * The countries a set of rows can be had in, for the filter's checkbox list.
 *
 * Built from the rows a table is given rather than from the whole lineup: the
 * landing page's ten-row preview would otherwise offer a country none of its
 * ten rows are in, with a count stuck at 0. The comps list only what is shown.
 */
export function countriesFor(rows: DedicatedRow[]): CountryOption[] {
    return [
        ...new Map(
            rows.flatMap((row) => row.locations).map((l) => [l.code, { code: l.code, name: l.country }]),
        ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
}

export const DEDICATED_COUNTRIES = countriesFor(DEDICATED_ROWS);

export const DEDICATED_VENDOR_COUNT = new Set(DEDICATED_ROWS.map((r) => r.vendor)).size;
