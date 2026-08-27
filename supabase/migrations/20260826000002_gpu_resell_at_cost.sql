-- GPU pods: resell at provider cost, no house margin.
--
-- Product decision, 2026-08-26: GPU capacity is sold at exactly what RunPod
-- charges us. markup_pct 1.250 becomes 1.000 across every (gpu, cloud_type,
-- interruptible) row.
--
-- What this touches, and what it does not:
--
--   * NEW pods only. lib/services/runpod/operations/pod-lifecycle-operations.ts
--     reads markup_pct at create time and freezes the result on
--     gpu_pods.hourly_cost_usd, so pods already running keep the rate they
--     were quoted. At the time of writing there are no non-terminated pods,
--     so nothing is repriced either way.
--
--   * Every public price recomputes on the next request. The marketing pages,
--     /pricing and the deploy quote all run computeResalePerHour() against
--     this column rather than storing a copy.
--
-- computeResalePerHour() rejects markupPct < 1, so 1.000 is the floor this
-- system supports — it can sell at cost but not below it. floor_per_hour_usd
-- stays 0, meaning no minimum is imposed on top.
--
-- GPU_MARKUP_PCT in lib/services/runpod/helpers.ts mirrors this value for the
-- deploy wizard's client-side quote and must be changed with it.

update gpu_pricing
set markup_pct = 1.000,
    updated_at = now()
where markup_pct <> 1.000;
