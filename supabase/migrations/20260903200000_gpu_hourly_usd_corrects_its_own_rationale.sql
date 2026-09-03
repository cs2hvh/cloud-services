-- The reason gpu_hourly_usd exists, corrected.
--
-- 20260903190000 added the column with a rationale that was wrong in three
-- places, and that wrong text is now frozen in
-- supabase_migrations.schema_migrations.statements where the file's own
-- correction cannot reach it. This migration puts the true reason in the column
-- comment, which is what anyone inspecting the schema actually reads.
--
-- The false claims were: that resolve_hourly_rate drops the GPU count (it does
-- not — charge_service_hour applies p_units one level up, which I did not
-- read); that the per-GPU floor was applied per-pod (it is not — greatest()
-- runs before the units multiply); and that every pod had gpu_count = 1 (pod 4
-- has eight, pod 5 has two — I generalised from a five-row LIMIT).
--
-- The old markup x runpod_cost_per_hr path was therefore CORRECT on count and
-- floor. The actual hazard ran the other way: this frozen rate already includes
-- gpu_count while openGpuPodMeters sets the meter's units to gpu_count, so
-- billing it through the unmodified registry would have charged pod 4 eight
-- times over. `fixedUnits: 1` on the gpu_pod registry entry is what prevents
-- that, and this column is only safe to bill from while that field is set.

comment on column public.gpu_pods.gpu_hourly_usd is
$c$GPU resale rate for the WHOLE pod, $/hour, frozen when the pod was created:
max(observed RunPod price * markup, floor) * gpu_count, storage excluded.

DO NOT MULTIPLY BY gpu_count AGAIN. It is already in this number. The gpu_pod
meter's `units` column is set to gpu_count by openGpuPodMeters and
charge_service_hour multiplies the resolved rate by p_units, so the sweep's
gpu_pod registry entry MUST pass fixedUnits: 1. Without it an 8-GPU pod bills
eight times its rate.

Storage is NOT included here — gpu_pod_storage meters the local disk
separately. Contrast hourly_cost_usd, which is GPU + disk and exists to be shown
to the customer as the all-in rate.

WHY FROZEN. Not because the live path miscomputed — it did not — but because it
multiplied by whatever markup gpu_pricing held at CHARGE time, so changing the
markup silently re-rated every running pod. The markup has in fact moved: pods
1-7 carry ~1.25, pods 8-15 carry 1.00. Freezing matches compute
(servers.hourly_cost) and set_price's rule that a price change is never
retroactive.

NULL means the pod predates this column. resolve_hourly_rate raises on a null or
non-positive upstream cost, so such a pod fails its charge loudly rather than
billing zero.$c$;
