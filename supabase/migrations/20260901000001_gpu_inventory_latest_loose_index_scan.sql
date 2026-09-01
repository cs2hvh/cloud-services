-- gpu_inventory_latest: stop reading a million rows to return 96.
--
-- SYMPTOM
--
-- /dashboard/services/gpu/deploy intermittently failed with "canceling
-- statement due to statement timeout". Intermittent because the query grew
-- slower every day and had begun to straddle the timeout — sometimes the page
-- loaded, sometimes it did not.
--
-- CAUSE
--
-- The view was DISTINCT ON (gpu_catalog_id, cloud_type, coalesce(data_center_id,''))
-- ORDER BY the same, observed_at DESC. Postgres implements that by reading
-- EVERY row in sorted order and keeping the first of each group.
-- gpu_inventory_snapshots held 1,022,889 rows and produced exactly 96 — and
-- grows by ~135,000 a day, because the price-sync cron writes all 96 keys
-- roughly once a minute.
--
-- The growth has a start date: 376 rows on 2026-08-24, then ~135k/day from
-- 2026-08-26 onward. That is when the Cloudflare crons were revived, which is
-- also when this page started failing.
--
-- TWO PARTS TO THE FIX
--
-- 1. The index. idx_gpu_inv_lookup was
--    (gpu_catalog_id, cloud_type, observed_at DESC) — it omits
--    coalesce(data_center_id,'') from the MIDDLE of the sort key, so it could
--    not satisfy the ordering and the plan carried an Incremental Sort over a
--    million rows. idx_gpu_inv_latest_distinct adds the missing term.
--    Cost fell 135,555 -> 48,169.
--
-- 2. The query shape. Even with a perfect index the plan still WALKED all
--    1,022,983 rows to emit 96, and still took 5.2 seconds. An index cannot
--    rescue a query whose shape requires touching every row.
--
--    So this replaces DISTINCT ON with a loose index scan (skip scan):
--      a. walk the distinct KEYS via a recursive self-join that repeatedly asks
--         the index for "the next key greater than this one" — one seek per key
--      b. for each key, one more seek for its newest row, using the DESC tail
--         of the same index
--
--    ~192 index seeks total, regardless of table size. 5,258ms -> 137ms.
--
-- WHY NOT JUST PRUNE
--
-- Deleting old snapshots would have fixed today and reintroduced the problem in
-- a fortnight, because the sync keeps writing. This makes the read independent
-- of how much history accumulates, which is the property that actually matters.
-- Pruning is still worth doing for storage (258 MB and climbing) but it is now
-- a housekeeping choice rather than an outage waiting to happen.
--
-- VERIFIED: output is byte-identical to the old view — 96 rows both ways, zero
-- rows in either EXCEPT direction.
--
-- The index is NOT optional. Dropping idx_gpu_inv_latest_distinct does not
-- break this view; it silently makes it slow again.

create index concurrently if not exists idx_gpu_inv_latest_distinct
  on public.gpu_inventory_snapshots
     (gpu_catalog_id, cloud_type, (coalesce(data_center_id, '')), observed_at desc);

create or replace view public.gpu_inventory_latest as
with recursive keys as (
    -- Seed: the first key in index order.
    (
        select s.gpu_catalog_id,
               s.cloud_type,
               coalesce(s.data_center_id, '') as dc
          from public.gpu_inventory_snapshots s
         order by s.gpu_catalog_id, s.cloud_type, coalesce(s.data_center_id, '')
         limit 1
    )
    union all
    -- Step: the next key strictly greater than the previous. The row-value
    -- comparison is what lets the index answer this with a single seek.
    select nxt.gpu_catalog_id, nxt.cloud_type, nxt.dc
      from keys k
      cross join lateral (
          select s.gpu_catalog_id,
                 s.cloud_type,
                 coalesce(s.data_center_id, '') as dc
            from public.gpu_inventory_snapshots s
           where (s.gpu_catalog_id, s.cloud_type, coalesce(s.data_center_id, ''))
                 > (k.gpu_catalog_id, k.cloud_type, k.dc)
           order by s.gpu_catalog_id, s.cloud_type, coalesce(s.data_center_id, '')
           limit 1
      ) nxt
)
select newest.gpu_catalog_id,
       newest.cloud_type,
       newest.data_center_id,
       newest.stock_status,
       newest.available_counts,
       newest.on_demand_per_hr,
       newest.spot_per_hr,
       newest.observed_at
  from keys k
  cross join lateral (
      select s.gpu_catalog_id,
             s.cloud_type,
             s.data_center_id,
             s.stock_status,
             s.available_counts,
             s.on_demand_per_hr,
             s.spot_per_hr,
             s.observed_at
        from public.gpu_inventory_snapshots s
       where s.gpu_catalog_id = k.gpu_catalog_id
         and s.cloud_type = k.cloud_type
         and coalesce(s.data_center_id, '') = k.dc
       order by s.observed_at desc
       limit 1
  ) newest;
