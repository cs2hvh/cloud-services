-- gpu_pods.gpu_hourly_usd — the GPU resale rate the customer was quoted,
-- frozen at create, GPU only.
--
-- CORRECTION, 2026-09-03, SAME DAY. The rationale first committed with this
-- file was wrong in three places. It is rewritten below rather than preserved,
-- because a migration comment is read as fact by whoever comes next; the
-- record of the error is in this header and in the commit that followed.
--
-- WHAT I GOT WRONG
--
-- I claimed the old registry entry (markup x runpod_cost_per_hr) could not
-- reproduce the quote, for two reasons. Both were false:
--
--   1. "resolve_hourly_rate ignores the GPU count, so an 8-GPU pod bills one
--      eighth." No. resolve_hourly_rate takes p_quantity AND the caller passes
--      p_units separately; charge_service_hour applies the count one level up,
--      `v_gross := round(v_hourly * coalesce(p_units, 1), 6)`. I read
--      resolve_hourly_rate, saw p_quantity unused by the markup branch, and
--      never read its caller.
--
--   2. "The floor is applied per-pod, not per-GPU." No. greatest(rate, floor)
--      happens before the units multiply, so the SQL produced
--      max(observed x markup, floor) x gpu_count — identical to the quote's
--      computeResalePerHour.
--
--   3. "Every pod ever created has gpu_count = 1." False, and the one a query
--      would have settled: pod 4 has EIGHT GPUs and pod 5 has two. I read five
--      rows under a LIMIT and generalised to fifteen.
--
-- The direction of the error matters. The old path was correct on count, and
-- the danger was the opposite of what I described: this frozen rate ALREADY
-- includes gpu_count, while openGpuPodMeters sets the meter's units to
-- gpu_count, so billing it through the unchanged registry would have charged
-- pod 4 EIGHT TIMES its rate — $119.07/hr against $14.88. The peer session
-- caught that and added `fixedUnits: 1` to the gpu_pod registry entry, which is
-- what makes this column safe to bill from. Without it this migration would
-- have been an overcharge, not a fix.
--
-- WHY THE COLUMN IS STILL RIGHT
--
-- One real reason, not three: NON-RETROACTIVITY. The old path multiplied by
-- whatever markup gpu_pricing held at charge time, so changing the markup
-- silently re-rated every running pod. That is not hypothetical here — the
-- markup HAS moved: pods 1-7 were created at ~1.25 and pods 8-15 at 1.00. A
-- live-markup path would bill the old pods at today's number. Freezing matches
-- compute (servers.hourly_cost) and set_price's rule that a price change is
-- never retroactive.
--
-- WHY NOT hourly_cost_usd
--
-- It is GPU + local disk (pod 15: 0.99 + 140GB x $0.10/mo / 730 = 1.0092), so
-- billing against it would charge the disk twice — gpu_pod_storage already
-- meters it. It also cannot be narrowed to GPU-only: five customer-facing
-- readers render it as the pod's all-in rate, including a SUM across pods on
-- the dashboard, and narrowing it would understate all five with no error.
alter table public.gpu_pods
  add column if not exists gpu_hourly_usd numeric(12,4);

comment on column public.gpu_pods.gpu_hourly_usd is
$c$GPU resale rate for the WHOLE pod, $/hour, frozen when the pod was created.
gpu_count is already multiplied in; do not multiply again. Storage is NOT
included — that bills separately through the gpu_pod_storage meter.

This is the billing spine's upstream column for service_type gpu_pod, paired
with a passthrough markup of 1.0, exactly as compute uses servers.hourly_cost.

Contrast hourly_cost_usd, which is GPU + local disk and exists to be shown to
the customer as the pod's all-in rate.

NULL means the pod predates this column. resolve_hourly_rate raises on a null or
non-positive upstream cost, so such a pod fails its charge loudly rather than
billing zero.$c$;

-- Backfill the 15 existing rows. All are terminated and none ever produced a
-- charge, so this is for history and for the not-null-once-populated invariant,
-- not for money. 730 is hardcoded deliberately: it is the divisor
-- storagePerHour actually used when these rows were written, so the subtraction
-- inverts what happened rather than what should have happened.
update public.gpu_pods
   set gpu_hourly_usd = round(
         hourly_cost_usd
         - round(((greatest(container_disk_gb,0) + greatest(volume_gb,0)) * 0.10) / 730.0, 4)
       , 4)
 where gpu_hourly_usd is null
   and hourly_cost_usd is not null;
