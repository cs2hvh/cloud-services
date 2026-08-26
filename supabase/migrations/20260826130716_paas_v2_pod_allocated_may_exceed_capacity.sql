-- pod_allocated is DERIVED from the live cluster rather than maintained as a
-- counter. That exposed a flaw in its check constraint:
--
--   check (pod_allocated >= 0 and pod_allocated <= pod_capacity)
--
-- Reality can exceed recorded capacity. pod_capacity is our estimate of the LKE
-- limit and can be set wrong, lowered, or outgrown by pods we did not place
-- (system DaemonSets scale with node count). When that happens the constraint
-- does not prevent the overage — the overage is already in the cluster — it
-- only prevents us from WRITING IT DOWN, forcing the sync to clamp and report a
-- comfortable number.
--
-- A schema that cannot express bad news turns an over-capacity cluster into an
-- at-capacity one, and the entire point of this column is to stop placement
-- scheduling onto a cluster fuller than the record admits. Same lesson as
-- hourly_usd being nullable.
alter table paas.clusters drop constraint if exists clusters_alloc_sane;
alter table paas.clusters add constraint clusters_alloc_sane check (pod_allocated >= 0);

comment on column paas.clusters.pod_allocated is
  'Non-terminal pods observed on the cluster, derived by placement sync rather than incremented. MAY exceed pod_capacity — that is an over-capacity cluster, which placement must be able to see rather than a value the schema forbids.';
