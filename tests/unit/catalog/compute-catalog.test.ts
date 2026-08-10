// One catalog, one price. The marketing pricing page used to carry a
// hand-written plan table while the deploy wizard computed prices from
// linode_types x linode_pricing; every shared-tier plan disagreed ($6 vs
// $5.40, $12 vs $12.96, $24 vs $25.92, $48 vs $51.84) and the page advertised
// two tiers that are not Linode classes at all.
//
// These tests pin the property that matters: a price shown to a visitor is the
// price the wizard will quote, because both run resolveLinodePlanPrice().
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { getPublicComputeCatalog, COMPUTE_TIERS } from '@/lib/catalog/compute';
import { resolveLinodePlanPrice } from '@/lib/pricing/linode-catalog';

vi.mock('@/lib/pricing/linode-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pricing/linode-catalog')>();
  return { ...actual, getLinodeCatalog: vi.fn() };
});

const PLAN = (over: Record<string, unknown> = {}) => ({
  id: 'g6-nanode-1',
  label: 'Nanode 1GB',
  class: 'nanode',
  vcpus: 1,
  memoryMB: 1024,
  diskGB: 25,
  transferGB: 1024,
  networkOutMbps: 1000,
  listHourlyUSD: 0.0075,
  markupPct: 1,
  floorPerHourUSD: 0,
  backupsHourlyUSD: null,
  regionPrices: [],
  ...over,
});

async function withCatalog(plans: unknown[], regions = [{ id: 'us-ord', label: 'Chicago', country: 'us' }]) {
  const { getLinodeCatalog } = await import('@/lib/pricing/linode-catalog');
  vi.mocked(getLinodeCatalog).mockResolvedValue({ plans, regions, images: [] } as never);
  return getPublicComputeCatalog({} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getPublicComputeCatalog', () => {
  it('quotes exactly what resolveLinodePlanPrice would charge', async () => {
    const plan = PLAN();
    const cat = await withCatalog([plan]);

    const shown = cat.tiers[0].plans[0];
    const charged = resolveLinodePlanPrice(plan as never, 'us-ord');

    expect(shown.monthlyUSD).toBe(charged.monthlyUSD);
    expect(shown.hourlyUSD).toBe(charged.hourlyUSD);
  });

  it('reproduces the live nanode price the wizard shows', async () => {
    // 0.0075/hr x 720 = $5.40 — the figure in the deploy wizard, not the $6
    // the marketing page used to print.
    const cat = await withCatalog([PLAN()]);

    expect(cat.tiers[0].plans[0].monthlyUSD).toBe(5.4);
    expect(cat.tiers[0].plans[0].monthlyUSD).not.toBe(6);
  });

  it('applies markup and floor rather than any stored display price', async () => {
    const cat = await withCatalog([PLAN({ markupPct: 2, floorPerHourUSD: 0 })]);
    expect(cat.tiers[0].plans[0].monthlyUSD).toBe(10.8);

    const floored = await withCatalog([PLAN({ markupPct: 1, floorPerHourUSD: 0.02 })]);
    expect(floored.tiers[0].plans[0].monthlyUSD).toBe(14.4);
  });

  it('quotes the cheapest region so "from $X" is actually obtainable', async () => {
    const plan = PLAN({
      regionPrices: [
        { id: 'ap-south', hourly: 0.02, monthly: 14.4 },
        { id: 'us-ord', hourly: 0.005, monthly: 3.6 },
      ],
    });
    const cat = await withCatalog([plan], [
      { id: 'ap-south', label: 'Mumbai', country: 'in' },
      { id: 'us-ord', label: 'Chicago', country: 'us' },
    ]);

    expect(cat.tiers[0].plans[0].monthlyUSD).toBe(3.6);
  });

  it('never advertises a tier with nothing sellable behind it', async () => {
    // "Compute Optimized" and "Storage Optimized" were on the page with no
    // Linode class behind them, so no plan could be bought.
    const cat = await withCatalog([PLAN()]);

    expect(cat.tiers.map((t) => t.key)).toEqual(['shared']);
    for (const tier of cat.tiers) expect(tier.plans.length).toBeGreaterThan(0);
  });

  it('only groups by classes the provider actually has', async () => {
    const realClasses = new Set(['nanode', 'standard', 'dedicated', 'highmem', 'premium']);
    for (const tier of COMPUTE_TIERS) {
      for (const cls of tier.classes) expect(realClasses.has(cls)).toBe(true);
    }
  });

  it('sorts plans cheapest first and derives the tier "from" price from them', async () => {
    const cat = await withCatalog([
      PLAN({ id: 'big', listHourlyUSD: 0.072, vcpus: 4, memoryMB: 8192 }),
      PLAN({ id: 'small', listHourlyUSD: 0.0075 }),
    ]);

    expect(cat.tiers[0].plans.map((p) => p.id)).toEqual(['small', 'big']);
    expect(cat.tiers[0].fromMonthlyUSD).toBe(cat.tiers[0].plans[0].monthlyUSD);
  });

  it('survives an empty region list instead of rendering nothing', async () => {
    const cat = await withCatalog([PLAN()], []);
    expect(cat.tiers[0].plans[0].monthlyUSD).toBe(5.4);
  });
});

describe('no page hardcodes a compute price', () => {
  // The guard. If someone pastes a plan table back into a marketing component,
  // this fails rather than the two silently drifting again.
  it('marketing compute sections carry no literal plan-price table', () => {
    const file = path.join(
      process.cwd(),
      'components/services/compute-pricing-section.tsx'
    );
    const src = fs.readFileSync(file, 'utf8');

    // The shape of the removed table: { vcpu: N, ram: "...", ..., price: N }
    const planLiteral = /vcpu:\s*\d+[\s\S]{0,120}?price:\s*\d+/;
    expect(planLiteral.test(src)).toBe(false);
  });

  it('does not reintroduce a 730-hour month', () => {
    // The platform bills on 720 h/month. This file divided by 730, so its
    // hourly figure never matched the wizard's or the cron's.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'components/services/compute-pricing-section.tsx'),
      'utf8'
    );
    // Comments discuss the old divisor by name, so test the code only.
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\/\s*730/);
    expect(code).toMatch(/\/\s*720/);
  });
});
