import { describe, it, expect } from 'vitest';
import {
  resolveLinodePlanPrice,
  isTypeAvailableInRegion,
  findLinodePlan,
} from '@/lib/pricing/linode-catalog';
import type { LinodeCatalog, LinodeCatalogPlan } from '@/lib/pricing/linode-catalog';

function makePlan(overrides: Partial<LinodeCatalogPlan> = {}): LinodeCatalogPlan {
  return {
    id: 'g6-standard-2',
    label: 'Linode 4GB',
    class: 'standard',
    vcpus: 2,
    memoryMB: 4096,
    diskGB: 80,
    transferGB: 4000,
    networkOutMbps: 4000,
    listHourlyUSD: 0.036,
    listMonthlyUSD: 24,
    regionPrices: [],
    backupsHourlyUSD: null,
    backupsRegionPrices: [],
    markupPct: 1,
    floorPerHourUSD: 0,
    pricingActive: true,
    ...overrides,
  };
}

function makeCatalog(overrides: Partial<LinodeCatalog> = {}): LinodeCatalog {
  const availability = overrides.availability ?? new Map<string, boolean>();
  return {
    regions: [],
    plans: [],
    images: [],
    availability,
    // Derived the same way the real catalog builder does.
    regionsWithAvailabilityData: new Set(
      [...availability.keys()].map((k) => k.split(':')[0])
    ),
    syncedAt: null,
    ...overrides,
  };
}

describe('resolveLinodePlanPrice', () => {
  it('applies the markup to the base list price', () => {
    const plan = makePlan({ listHourlyUSD: 0.036, markupPct: 1.25 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.hourlyUSD).toBe(0.045); // 0.036 * 1.25
    expect(price.listHourlyUSD).toBe(0.036);
  });

  it('prefers the region_prices override over the base price', () => {
    const plan = makePlan({
      listHourlyUSD: 0.036,
      markupPct: 1.25,
      regionPrices: [{ id: 'br-gru', hourly: 0.052, monthly: 34.56 }],
    });
    const price = resolveLinodePlanPrice(plan, 'br-gru');
    expect(price.listHourlyUSD).toBe(0.052);
    expect(price.hourlyUSD).toBe(0.065); // 0.052 * 1.25
  });

  it('falls back to the base price for regions without an override', () => {
    const plan = makePlan({
      listHourlyUSD: 0.036,
      markupPct: 1.25,
      regionPrices: [{ id: 'br-gru', hourly: 0.052, monthly: 34.56 }],
    });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.listHourlyUSD).toBe(0.036);
    expect(price.hourlyUSD).toBe(0.045);
  });

  it('clamps the resale price up to the per-hour floor', () => {
    const plan = makePlan({ listHourlyUSD: 0.036, markupPct: 1.25, floorPerHourUSD: 0.1 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.hourlyUSD).toBe(0.1);
    expect(price.monthlyUSD).toBe(72); // floor * 720
  });

  it('does not clamp when markup already beats the floor', () => {
    const plan = makePlan({ listHourlyUSD: 0.2, markupPct: 1.5, floorPerHourUSD: 0.1 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.hourlyUSD).toBe(0.3);
  });

  it('derives monthly as hourly x 720 rounded to cents', () => {
    // 0.0075 * 1.337 = 0.0100275 → hourly rounds to 0.01003 (5 dp);
    // 0.01003 * 720 = 7.2216 → monthly rounds to 7.22 (2 dp).
    const plan = makePlan({ listHourlyUSD: 0.0075, markupPct: 1.337 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.hourlyUSD).toBe(0.01003);
    expect(price.monthlyUSD).toBe(7.22);
  });

  it('applies the markup to the backups add-on', () => {
    const plan = makePlan({ backupsHourlyUSD: 0.008, markupPct: 1.25 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.backupsHourlyUSD).toBe(0.01); // 0.008 * 1.25
    expect(price.backupsMonthlyUSD).toBe(7.2); // 0.01 * 720
  });

  it('does not apply the floor to the backups add-on', () => {
    const plan = makePlan({ backupsHourlyUSD: 0.002, markupPct: 1, floorPerHourUSD: 0.5 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.backupsHourlyUSD).toBe(0.002);
  });

  it('returns null backups pricing when the plan has no backups add-on', () => {
    const plan = makePlan({ backupsHourlyUSD: null });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.backupsHourlyUSD).toBeNull();
    expect(price.backupsMonthlyUSD).toBeNull();
  });

  it('markup of 1.0 with no floor resells at list price', () => {
    const plan = makePlan({ listHourlyUSD: 0.036, markupPct: 1, floorPerHourUSD: 0 });
    const price = resolveLinodePlanPrice(plan, 'us-ord');
    expect(price.hourlyUSD).toBe(0.036);
    expect(price.monthlyUSD).toBe(25.92);
  });
});

describe('isTypeAvailableInRegion', () => {
  const catalog = makeCatalog({
    availability: new Map([
      ['us-ord:g6-standard-2', true],
      ['br-gru:g6-standard-2', false],
    ]),
  });

  it('returns true when the pair is marked available', () => {
    expect(isTypeAvailableInRegion(catalog, 'g6-standard-2', 'us-ord')).toBe(true);
  });

  it('returns false when the pair is marked unavailable', () => {
    expect(isTypeAvailableInRegion(catalog, 'g6-standard-2', 'br-gru')).toBe(false);
  });

  it('fails OPEN for a region with no availability data (unknown, not sold out)', () => {
    // eu-west has no rows at all → unknown; Linode still validates at create.
    expect(isTypeAvailableInRegion(catalog, 'g6-standard-2', 'eu-west')).toBe(true);
  });

  it('fails OPEN for a type missing from a region that has data (new type)', () => {
    expect(isTypeAvailableInRegion(catalog, 'g7-unknown', 'us-ord')).toBe(true);
  });

  it('fails OPEN on an entirely empty availability map', () => {
    expect(isTypeAvailableInRegion(makeCatalog(), 'g6-standard-2', 'us-ord')).toBe(true);
  });
});

describe('findLinodePlan', () => {
  const plan = makePlan();
  const catalog = makeCatalog({ plans: [plan] });

  it('finds a plan by type id', () => {
    expect(findLinodePlan(catalog, 'g6-standard-2')).toBe(plan);
  });

  it('returns null for an unknown type id', () => {
    expect(findLinodePlan(catalog, 'g6-nope')).toBeNull();
  });
});
