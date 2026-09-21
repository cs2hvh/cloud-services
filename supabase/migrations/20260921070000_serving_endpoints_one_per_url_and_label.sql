-- serving_endpoints was one row per (model, base_url): a rule written for
-- pods, where two rows on one URL could only be a mistake. 2026-09-21 the
-- first model served through a partner API instead of a pod needs three rows
-- on the same URL, one per API key, so that load spreads across the keys and
-- a 429 on one moves the request to the next. The label now tells them
-- apart; the same URL with the same label is still refused.

begin;

alter table inference.serving_endpoints
  drop constraint if exists serving_endpoints_one_per_url;

create unique index if not exists serving_endpoints_one_per_url_and_label
  on inference.serving_endpoints (model_id, base_url, coalesce(label, ''));

commit;
