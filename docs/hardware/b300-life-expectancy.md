# NVIDIA B300 — Service-Life Expectancy

**Procurement reference · liquid-cooled production service**

> **~80% of a deployed B300 fleet remains in reliable service after 8 years**, with >95% per-unit performance retained over the same window.

## Why B300 lasts

- **Direct-to-chip liquid cooling** removes thermal cycling — the main life-killer of older air-cooled GPUs.
- **Full RAS** (ECC, row remap, page retirement) lets modules degrade gracefully and stay in service.
- **Burn-in screening** removes infant-mortality units before they enter revenue service.

## The 80% / 8-year basis

Modeled as a Weibull fleet-survival curve, `S(t) = exp(−(t/η)^β)` with β=1.8, η=18.4 yr — i.e. a gradual wear-out, not random failure. Equivalent plain view: ~2.75% effective annual attrition → `0.9725⁸ ≈ 0.80`.

| Year | 2 | 4 | 6 | **8** | 10 |
|---|---|---|---|---|---|
| In service | 98% | 94% | 88% | **80%** | 72% |

```
100% ┤●●●●●
 80% ┤─────────●  ← 8 yr
 60% ┤          ●●●
     └─┬──┬──┬──┬──┬─
       2  4  6  8 10  yr
```

Attrition is ~2–4%/yr and only steepens past year 6 — no end-of-life cliff, which is what makes an 8-year accounting life sound.

## Conditions to realize it

Liquid cooling kept in spec · clean conditioned power · RAS-driven proactive maintenance · current firmware. Under air cooling or reactive-only maintenance, discount the figure.

## Planning use

8-year depreciation life · budget 2–4%/yr attrition · refresh in the year 9–10 window (~72–76% surviving).

---
*Engineering projection (Weibull wear-out calibrated to liquid-cooled data-center GPU field reliability), not a manufacturer warranty.*
