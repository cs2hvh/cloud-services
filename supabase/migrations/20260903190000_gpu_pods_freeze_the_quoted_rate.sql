-- gpu_pods.gpu_hourly_usd — the GPU resale rate the customer was quoted,
-- frozen at create, GPU only.
--
-- WHY A NEW COLUMN AND NOT hourly_cost_usd
--
-- hourly_cost_usd is (GPU resale) + (local disk storage):
--
--   pod 15: runpod 0.99 + (140GB * $0.10/mo / 730) = 0.99 + 0.0192 = 1.0092
--
-- Storage already bills through its own gpu_pod_storage meter, so pointing the
-- sweep's gpu_pod registry entry at hourly_cost_usd would charge the disk twice.
-- Nor can hourly_cost_usd simply be narrowed to GPU-only: it is rendered to
-- customers in five places as the pod's total rate — active-pods-table,
-- pod-detail, the gpu-dashboard spend total (a SUM across pods), the create
-- response, and pod-read-operations' row mapper. Narrowing it would understate
-- every one of them silently, with no error and no code change to notice.
--
-- So hourly_cost_usd keeps its meaning (customer-visible total) and the billing
-- spine gets its own column.
--
-- WHY FROZEN RATHER THAN RE-DERIVED
--
-- The obvious alternative is to keep charging markup * runpod_cost_per_hr, which
-- is what the registry does today. That cannot reproduce the quote, for two
-- independent reasons:
--
--   1. GPU COUNT. runpod_cost_per_hr is the PER-GPU upstream rate. The quote
--      (computeResalePerHour) multiplies by gpuCount; billing.resolve_hourly_rate
--      does not — its markup branch is `p_upstream_cost * p_amount` and ignores
--      p_quantity entirely. The sweep passes gpu_count as p_units and it is
--      silently dropped. An 8-GPU pod would bill one eighth of its quote.
--
--   2. FLOOR. The quote applies floor_per_hour_usd PER GPU and then multiplies
--      (`max(observed * markup, floor) * gpuCount`). resolve_hourly_rate applies
--      the floor once, to the whole pod, at the very end.
--
-- Both are invisible today: every pod ever created has gpu_count = 1, and
-- gpu_pod has never produced a single charge row. They would appear on the first
-- multi-GPU pod after GPU billing goes live, as an underbill proportional to the
-- GPU count — the kind that looks like healthy revenue, just less of it.
--
-- Freezing sidesteps both: the number written here already has count and the
-- per-GPU floor baked in, because it is literally the number the customer was
-- shown. It also makes GPU consistent with compute (servers.hourly_cost) and
-- with set_price's rule that a price change is never retroactive: set_gpu_markup
-- now moves the rate for pods created after it, and leaves running pods alone.

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
