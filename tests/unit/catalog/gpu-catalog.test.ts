// The GPU service page carried seven hardcoded GPUs with fixed prices and
// fixed `stock: "available"` strings. Against live data those prices had
// drifted badly — H100 SXM advertised at $2.99 while a pod was charged $4.11,
// B200 at $5.49 against $8.49 — and the stock strings could never be true.
//
// These pin the two properties that matter: the quoted price is the one
// computeResalePerHour() will charge, and availability is never asserted from
// a stale reading.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { getPublicGpuCatalog, STOCK_FRESHNESS_MS } from '@/lib/catalog/gpu';
import { computeResalePerHour } from '@/lib/services/runpod/helpers';

const NOW = Date.parse('2026-08-10T12:00:00Z');
const FRESH = new Date(NOW - 60_000).toISOString();
const STALE = new Date(NOW - STOCK_FRESHNESS_MS - 60_000).toISOString();

function db({ catalog = [], pricing = [], snapshots = [] }: Record<string, unknown[]>) {
  const table = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: rows, error: null });
    // gpu_catalog ends on .order(), the others on .limit()/.select()
    chain.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
    return chain;
  };
  return {
    from: (name: string) =>
      table(name === 'gpu_catalog' ? catalog : name === 'gpu_pricing' ? pricing : snapshots),
  } as never;
}

const CAT = (over = {}) => ({
  id: 'h100-sxm-80', display_name: 'H100 SXM (80 GB)', memory_gb: 80,
  sort_order: 1, is_active: true, ...over,
});
const PRICE = (over = {}) => ({
  gpu_catalog_id: 'h100-sxm-80', cloud_type: 'SECURE', interruptible: false,
  markup_pct: 1.25, floor_per_hour_usd: 0, ...over,
});
const SNAP = (over = {}) => ({
  gpu_catalog_id: 'h100-sxm-80', cloud_type: 'SECURE', stock_status: 'high',
  available_counts: [4], on_demand_per_hr: 3.29, observed_at: FRESH, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('getPublicGpuCatalog — price', () => {
  it('quotes exactly what a pod would be charged', async () => {
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP()] }), NOW
    );
    const charged = computeResalePerHour({
      observedPerHr: 3.29, markupPct: 1.25, floorPerHour: 0, gpuCount: 1,
    });

    expect(cat.gpus[0].hourlyUSD).toBe(charged);
    // And not the number the page used to print.
    expect(cat.gpus[0].hourlyUSD).not.toBe(2.99);
  });

  it('applies the per-GPU floor', async () => {
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE({ markup_pct: 1, floor_per_hour_usd: 9 })], snapshots: [SNAP()] }),
      NOW
    );
    expect(cat.gpus[0].hourlyUSD).toBe(9);
  });

  it('never prices below cost when markup_pct is a bad row', async () => {
    // computeResalePerHour throws under 1.0; a malformed row must not take the
    // whole page down, and must not quote under cost.
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE({ markup_pct: 0.5 })], snapshots: [SNAP()] }), NOW
    );
    expect(cat.gpus[0].hourlyUSD).toBe(3.29);
  });

  it('reports no price rather than a wrong one when there is no reading', async () => {
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [] }), NOW
    );
    expect(cat.gpus[0].hourlyUSD).toBeNull();
  });

  it('ignores interruptible pricing — the page quotes on-demand', async () => {
    const cat = await getPublicGpuCatalog(
      db({
        catalog: [CAT()],
        pricing: [PRICE({ interruptible: true, markup_pct: 5 }), PRICE({ markup_pct: 1.25 })],
        snapshots: [SNAP()],
      }),
      NOW
    );
    expect(cat.gpus[0].hourlyUSD).toBe(computeResalePerHour({
      observedPerHr: 3.29, markupPct: 1.25, floorPerHour: 0, gpuCount: 1,
    }));
  });
});

describe('getPublicGpuCatalog — stock honesty', () => {
  it('reports availability from a fresh reading', async () => {
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP()] }), NOW
    );
    expect(cat.gpus[0].stock).toBe('available');
    expect(cat.stockIsFresh).toBe(true);
  });

  it('refuses to claim stock from a stale reading', async () => {
    // The live failure: snapshots were 2.5 days old because nothing ran the
    // sync, and the page would have kept saying "In stock".
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP({ observed_at: STALE })] }), NOW
    );
    expect(cat.gpus[0].stock).toBe('unknown');
    expect(cat.stockIsFresh).toBe(false);
  });

  it('says unavailable when the provider reports no capacity', async () => {
    const none = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP({ stock_status: 'none', available_counts: [] })] }),
      NOW
    );
    expect(none.gpus[0].stock).toBe('unavailable');

    const zero = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP({ stock_status: 'high', available_counts: [0] })] }),
      NOW
    );
    expect(zero.gpus[0].stock).toBe('unavailable');
  });

  it('maps low capacity to limited, not available', async () => {
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP({ stock_status: 'low', available_counts: [1] })] }),
      NOW
    );
    expect(cat.gpus[0].stock).toBe('limited');
  });

  it('says unknown when a GPU has no reading at all', async () => {
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [] }), NOW
    );
    expect(cat.gpus[0].stock).toBe('unknown');
  });
});

describe('getPublicGpuCatalog — snapshot selection', () => {
  it('prefers a fresh reading over a stale one, whatever the price', async () => {
    // Freshness outranks price: a cheap stale row must not win.
    const cat = await getPublicGpuCatalog(
      db({
        catalog: [CAT()],
        pricing: [PRICE()],
        snapshots: [
          SNAP({ on_demand_per_hr: 0.5, observed_at: STALE }),
          SNAP({ on_demand_per_hr: 3.29, observed_at: FRESH }),
        ],
      }),
      NOW
    );
    expect(cat.gpus[0].observedAt).toBe(FRESH);
    expect(cat.gpus[0].stock).not.toBe('unknown');
  });

  it('picks the cheapest among fresh readings, not the newest', async () => {
    // Several cloud types report the same GPU at different rates. The rule is
    // deliberately "cheapest fresh", so a NEWER but pricier row must lose —
    // otherwise the public price follows whichever row the sync wrote last.
    const newerButPricier = new Date(NOW - 30_000).toISOString();
    const cat = await getPublicGpuCatalog(
      db({
        catalog: [CAT()],
        pricing: [PRICE(), PRICE({ cloud_type: 'COMMUNITY' })],
        snapshots: [
          SNAP({ cloud_type: 'SECURE', on_demand_per_hr: 9.99, observed_at: newerButPricier }),
          SNAP({ cloud_type: 'COMMUNITY', on_demand_per_hr: 3.29, observed_at: FRESH }),
        ],
      }),
      NOW
    );
    expect(cat.gpus[0].observedAt).toBe(FRESH);
    expect(cat.gpus[0].hourlyUSD).toBeLessThan(9);
  });

  it('links to the deploy wizard with the real catalog id', async () => {
    // The old array used invented ids like "h100-sxm", so its links pointed at
    // a SKU the wizard does not have.
    const cat = await getPublicGpuCatalog(
      db({ catalog: [CAT()], pricing: [PRICE()], snapshots: [SNAP()] }), NOW
    );
    expect(cat.gpus[0].href).toContain('gpu=h100-sxm-80');
  });
});

describe('no page hardcodes a GPU price', () => {
  it('the GPU service page carries no literal price table', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'components/services/gpu-service-page.tsx'), 'utf8'
    );
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/pricePerHour:\s*[\d.]+/);
    // and no "$N.NN / GPU·hr" strapline literal
    expect(code).not.toMatch(/\$\d+\.\d{2}\s*\/\s*GPU/);
  });

  it('the pricing page has no fallback price table', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/(marketing)/pricing/page.tsx'), 'utf8'
    );
    // Match the identifier itself: 'FALLBACK_PRICING_DATA:' only catches a
    // reintroduction that carries a type annotation.
    expect(src).not.toMatch(/const\s+FALLBACK_PRICING_DATA\b/);
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/monthly:\s*\d+\s*,\s*yearly:\s*\d+/);
  });
});
