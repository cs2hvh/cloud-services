/**
 * Service rates resolve from the price book, and a missing price is an ERROR.
 *
 * WHAT THIS FILE USED TO SAY
 *
 * The previous version mocked `Products` (public.products, dropped 2026-08-31)
 * and asserted, in two places:
 *
 *   const rates = await getRatesForDatabase('nonexistent');
 *   expect(rates.hourlyRate).toBe(0);
 *
 * That is the defect written down as the specification. A service whose price
 * could not be found was quoted, and billed, as free — and the test suite
 * protected it, so fixing the behaviour would have read as breaking the tests.
 * It is worth naming, because a test asserting a bug is the most expensive kind
 * to have: it converts every attempt to fix it into an argument.
 *
 * The assertion is now inverted. A deploy that cannot be priced must fail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  resolveHourly,
  invalidatePriceBook,
  HOURS_IN_MONTH,
  type PriceRow,
} from "@/lib/pricing/price-book";

/**
 * The book is stubbed at the DATABASE boundary, not at loadPriceBook().
 *
 * Mocking the module's own export does not work here: getRates() and
 * loadPriceBook() live in the same module, so the call between them binds
 * directly and never sees the mock. Faking the Supabase client means the real
 * query-shaping, mapping and caching all run — which is most of what could be
 * wrong.
 */
let bookRows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          is: async () => ({ data: bookRows, error: null }),
        }),
      }),
    }),
  }),
}));

const {
  getRatesForDatabase,
  getRatesForKubernetes,
  getRatesForObjectStorage,
  getRatesForSpectrum,
  getRatesForPlatformApp,
  getAllPlatformAppRates,
} = await import("@/config/pricing");

const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  serviceType: "objectspace",
  planKey: "*",
  rateModel: "fixed_hourly",
  amount: 5,
  unit: "usd_per_month",
  floorUsdPerHour: 0,
  setupFeeUsd: 0,
  ...over,
});

/** Load the book with these rows, in the column shape the table returns. */
function book(...rows: PriceRow[]) {
  bookRows = rows.map((r) => ({
    service_type: r.serviceType,
    plan_key: r.planKey,
    rate_model: r.rateModel,
    amount: r.amount,
    unit: r.unit,
    floor_usd_per_hour: r.floorUsdPerHour,
    setup_fee_usd: r.setupFeeUsd,
  }));
  invalidatePriceBook();
}

beforeEach(() => {
  vi.clearAllMocks();
  book();
});

// ─────────────────────────────────────────────────────────────────────────
// The conversion itself. Pure, so it needs no mocking — and it has to match
// billing.resolve_hourly_rate exactly or a quote stops matching its bill.
// ─────────────────────────────────────────────────────────────────────────

describe("resolveHourly", () => {
  it("passes an hourly price through unchanged", () => {
    expect(resolveHourly(row({ amount: 0.027, unit: "usd_per_hour" }))).toBe(0.027);
  });

  it("divides a monthly price by 720, not 730", () => {
    // 720 is the platform-wide convention and matches billing.hours_in_month().
    // 730 would re-rate every service by 1.4% against what the sweep charges.
    expect(resolveHourly(row({ amount: 300, unit: "usd_per_month" }))).toBe(
      Math.round((300 / 720) * 1e6) / 1e6,
    );
    expect(HOURS_IN_MONTH).toBe(720);
  });

  it("applies the floor when the computed rate is below it", () => {
    const r = resolveHourly(row({ amount: 1, unit: "usd_per_month", floorUsdPerHour: 0.5 }));
    expect(r).toBe(0.5);
  });

  it("multiplies a markup by the observed upstream cost", () => {
    const r = resolveHourly(
      row({ rateModel: "markup", amount: 1.25, unit: "multiplier" }),
      { upstreamCostPerHour: 2 },
    );
    expect(r).toBe(2.5);
  });

  it("refuses a markup with no upstream cost rather than treating it as free", () => {
    expect(() =>
      resolveHourly(row({ rateModel: "markup", amount: 1.25, unit: "multiplier" })),
    ).toThrow(/upstream cost/i);
  });

  it("refuses per-GB pricing with no quantity", () => {
    expect(() =>
      resolveHourly(row({ rateModel: "per_gb_hour", amount: 0.05, unit: "usd_per_gb_month" })),
    ).toThrow(/quantity/i);
  });

  it("treats a measured zero GB as zero, not as missing", () => {
    // An empty bucket is a real measurement. Only an ABSENT one is an error —
    // conflating the two is what billed a deleted bucket for months.
    const r = resolveHourly(
      row({ rateModel: "per_gb_hour", amount: 0.05, unit: "usd_per_gb_month" }),
      { quantityGb: 0 },
    );
    expect(r).toBe(0);
  });

  it("prices per-GB-month against the GB supplied", () => {
    const r = resolveHourly(
      row({ rateModel: "per_gb_hour", amount: 0.05, unit: "usd_per_gb_month" }),
      { quantityGb: 100 },
    );
    expect(Math.round(r * 720 * 100) / 100).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The service wrappers.
// ─────────────────────────────────────────────────────────────────────────

describe("config/pricing", () => {
  it("prices object storage from the book, with its setup fee", async () => {
    book(row({ serviceType: "objectspace", amount: 5, setupFeeUsd: 5 }));
    const r = await getRatesForObjectStorage();
    expect(r.initialCost).toBe(5);
    expect(Math.round(r.hourlyRate * 720 * 100) / 100).toBe(5);
  });

  it("prices spectrum from the book", async () => {
    book(row({ serviceType: "spectrum", amount: 300 }));
    const r = await getRatesForSpectrum();
    expect(Math.round(r.hourlyRate * 720)).toBe(300);
    expect(r.initialCost).toBe(0);
  });

  it("prices a database plan by its plan key", async () => {
    book(
      row({ serviceType: "database", planKey: "plan-a", amount: 14.99 }),
      row({ serviceType: "database", planKey: "plan-b", amount: 99 }),
    );
    const r = await getRatesForDatabase("plan-b");
    expect(Math.round(r.hourlyRate * 720)).toBe(99);
  });

  it("prices a platform-app size", async () => {
    book(row({ serviceType: "platform_apps", planKey: "small", amount: 5, setupFeeUsd: 5 }));
    const r = await getRatesForPlatformApp("small");
    expect(r.initialCost).toBe(5);
  });

  describe("kubernetes node count", () => {
    beforeEach(() => {
      book(row({ serviceType: "kubernetes", planKey: "k1", amount: 150, setupFeeUsd: 5 }));
    });

    it("multiplies the recurring rate by the node count", async () => {
      const one = await getRatesForKubernetes("k1", 1);
      const three = await getRatesForKubernetes("k1", 3);
      expect(three.hourlyRate).toBeCloseTo(one.hourlyRate * 3, 6);
    });

    it("does NOT multiply the setup fee — it is charged once per cluster", async () => {
      const three = await getRatesForKubernetes("k1", 3);
      expect(three.initialCost).toBe(5);
    });
  });

  describe("a missing price is an error, not free", () => {
    it("throws for a database plan that has no price", async () => {
      book(row({ serviceType: "database", planKey: "priced", amount: 10 }));
      await expect(getRatesForDatabase("nonexistent")).rejects.toThrow(/No live price/);
    });

    it("throws for a service with nothing in the book at all", async () => {
      book();
      await expect(getRatesForObjectStorage()).rejects.toThrow(/No live price/);
    });

    it("omits an unpriced platform-app size instead of showing it at $0", async () => {
      // A picker offering a size nobody priced is how somebody deploys free.
      book(row({ serviceType: "platform_apps", planKey: "small", amount: 5 }));
      const all = await getAllPlatformAppRates();
      expect(Object.keys(all)).toEqual(["small"]);
      expect(all.large).toBeUndefined();
    });
  });
});
