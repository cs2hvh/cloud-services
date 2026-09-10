/**
 * The published price block and the off-peak window it shares with billing.
 *
 * The point of these tests is that GET /v1/models can never quote a number
 * the usage consumer would not charge, and can never quote what a backend
 * charges us.
 */
import { describe, expect, it } from "vitest";
import { activeDiscountPct, isWithinUtcWindow, publicPrices } from "./pricing.ts";

const at = (hhmm: string) => new Date(`2026-09-10T${hhmm}:00.000Z`);

describe("isWithinUtcWindow", () => {
  it("includes the start minute and excludes the end minute", () => {
    expect(isWithinUtcWindow("02:00-06:00", at("02:00"))).toBe(true);
    expect(isWithinUtcWindow("02:00-06:00", at("05:59"))).toBe(true);
    expect(isWithinUtcWindow("02:00-06:00", at("06:00"))).toBe(false);
    expect(isWithinUtcWindow("02:00-06:00", at("01:59"))).toBe(false);
  });

  it("handles a window that wraps midnight", () => {
    expect(isWithinUtcWindow("22:00-02:00", at("23:30"))).toBe(true);
    expect(isWithinUtcWindow("22:00-02:00", at("01:00"))).toBe(true);
    expect(isWithinUtcWindow("22:00-02:00", at("12:00"))).toBe(false);
  });

  it("treats an unreadable window as no window", () => {
    for (const w of ["", "always", "02:00", "aa:bb-cc:dd"]) {
      expect(isWithinUtcWindow(w, at("03:00"))).toBe(false);
    }
  });
});

describe("activeDiscountPct", () => {
  it("needs both a window and a percent", () => {
    expect(activeDiscountPct({ window_utc: "00:00-23:59" }, at("03:00"))).toBe(0);
    expect(activeDiscountPct({ discount_pct: 50 }, at("03:00"))).toBe(0);
    expect(activeDiscountPct(null, at("03:00"))).toBe(0);
  });

  it("is the percent inside the window and zero outside it", () => {
    const op = { window_utc: "02:00-06:00", discount_pct: 40 };
    expect(activeDiscountPct(op, at("03:00"))).toBe(40);
    expect(activeDiscountPct(op, at("07:00"))).toBe(0);
  });
});

describe("publicPrices", () => {
  const pricing = {
    input_cents_per_mtok: 1500,
    cached_cents_per_mtok: 300,
    output_cents_per_mtok: 1500,
  };

  it("publishes dollars per million tokens", () => {
    const p = publicPrices(pricing, null, at("12:00"));
    expect(p).toMatchObject({
      currency: "USD",
      unit: "per_million_tokens",
      input: 15,
      cached_input: 3,
      output: 15,
      discount: null,
      effective_input: 15,
      effective_output: 15,
    });
  });

  it("converts sub-cent rates without float dust", () => {
    const p = publicPrices({ input_cents_per_mtok: 13, output_cents_per_mtok: 220 }, null);
    expect(p.input).toBe(0.13);
    expect(p.output).toBe(2.2);
  });

  it("falls back to the input rate for cached tokens, as billing does", () => {
    const p = publicPrices({ input_cents_per_mtok: 100, output_cents_per_mtok: 500 }, null);
    expect(p.cached_input).toBe(1);
  });

  it("reports a missing rate as null, never as free", () => {
    const p = publicPrices({}, null);
    expect(p.input).toBeNull();
    expect(p.output).toBeNull();
    expect(p.effective_output).toBeNull();
  });

  it("adds the discounted pair when a window is configured", () => {
    const p = publicPrices(pricing, { window_utc: "02:00-06:00", discount_pct: 50 }, at("12:00"));
    expect(p.discount).toEqual({
      percent: 50,
      window_utc: "02:00-06:00",
      active_now: false,
      input: 7.5,
      cached_input: 1.5,
      output: 7.5,
    });
    // Outside the window the effective price is still the list price.
    expect(p.effective_input).toBe(15);
    expect(p.effective_output).toBe(15);
  });

  it("switches the effective price inside the window", () => {
    const p = publicPrices(pricing, { window_utc: "02:00-06:00", discount_pct: 50 }, at("03:00"));
    expect(p.discount?.active_now).toBe(true);
    expect(p.effective_input).toBe(7.5);
    expect(p.effective_cached_input).toBe(1.5);
    expect(p.effective_output).toBe(7.5);
  });

  it("agrees with billing about whether the discount is live", () => {
    const op = { window_utc: "22:00-02:00", discount_pct: 25 };
    for (const t of ["21:59", "22:00", "01:59", "02:00", "12:00"]) {
      const quoted = publicPrices(pricing, op, at(t)).discount?.active_now;
      const billed = activeDiscountPct(op, at(t)) > 0;
      expect(quoted).toBe(billed);
    }
  });
});
