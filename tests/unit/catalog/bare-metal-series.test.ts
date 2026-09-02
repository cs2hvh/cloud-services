// The bare-metal list groups by product RANGE, so the range data has to hold.
//
// The page renders one section per series and hides any that come back empty.
// That is a forgiving renderer: a SKU assigned to a range nobody defined, or a
// range with nothing in it, produces a page that simply omits things rather
// than one that errors. A server silently missing from the catalogue is not a
// visual bug — it is a product you cannot buy, and nothing on screen says so.
//
// These pin the invariants the renderer assumes but does not check.

import { describe, it, expect } from 'vitest';

import {
  BARE_METAL_SKUS,
  BARE_METAL_SERIES,
  type SeriesKey,
} from '@/lib/catalog/bare-metal';

const SERIES_KEYS = Object.keys(BARE_METAL_SERIES) as SeriesKey[];

describe('bare-metal ranges', () => {
  it('gives every server a range that exists', () => {
    const orphans = BARE_METAL_SKUS.filter(
      (s) => !SERIES_KEYS.includes(s.series),
    ).map((s) => `${s.id} -> '${s.series}'`);

    expect(orphans, `servers assigned to an undefined range:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('leaves no range empty', () => {
    // An empty range is a heading that never renders — either the range should
    // go, or something was meant to be in it.
    const empty = SERIES_KEYS.filter(
      (k) => !BARE_METAL_SKUS.some((s) => s.series === k),
    );

    expect(empty, `ranges with no servers: ${empty.join(', ')}`).toEqual([]);
  });

  it('lists every server exactly once', () => {
    const ids = BARE_METAL_SKUS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orders ranges without ties', () => {
    // The page sorts sections by `order`. Ties make the sequence depend on
    // object key order, which is not something a catalogue should rely on.
    const orders = SERIES_KEYS.map((k) => BARE_METAL_SERIES[k].order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('keeps the ranges in ascending price, cheapest first', () => {
    // The whole point of the ordering is a readable price ladder down the page.
    // If a range's entry price undercuts the one above it, the ladder is wrong
    // and the ordering is telling the reader something untrue.
    const byOrder = [...SERIES_KEYS].sort(
      (a, b) => BARE_METAL_SERIES[a].order - BARE_METAL_SERIES[b].order,
    );
    const entryPrices = byOrder.map((k) => ({
      range: BARE_METAL_SERIES[k].label,
      from: Math.min(
        ...BARE_METAL_SKUS.filter((s) => s.series === k).map((s) => s.priceMonthly),
      ),
    }));

    const inversions = entryPrices
      .slice(1)
      .map((cur, i) => ({ prev: entryPrices[i], cur }))
      .filter(({ prev, cur }) => cur.from < prev.from)
      .map(({ prev, cur }) => `${cur.range} ($${cur.from}) sits below ${prev.range} ($${prev.from})`);

    expect(inversions, `range order does not match entry price:\n${inversions.join('\n')}`).toEqual([]);
  });

  it('describes every range', () => {
    // The header renders label, tagline and blurb unconditionally. A blank one
    // is a gap in the page, not a caught error.
    for (const k of SERIES_KEYS) {
      const m = BARE_METAL_SERIES[k];
      expect(m.label.trim(), `${k}.label`).not.toBe('');
      expect(m.tagline.trim(), `${k}.tagline`).not.toBe('');
      expect(m.blurb.trim().length, `${k}.blurb too short to be useful`).toBeGreaterThan(40);
      expect(m.accent, `${k}.accent`).toMatch(/^(#|rgb)/);
    }
  });
});
