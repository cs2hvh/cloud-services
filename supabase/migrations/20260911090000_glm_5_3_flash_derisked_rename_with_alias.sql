-- zhipu/glm-5.3-flash-uncensored  ->  zhipu/glm-5.3-flash-derisked
--
-- Unlike the 2026-09-08 rename, this id is in real use: ~200 requests an hour
-- and 12,484 usage rows. A bare rename would 404 every one of those callers on
-- their next request, so this adds the thing the catalog has never had — an
-- alias — and points the old id at the new one. The gateway resolves aliases
-- before routing, so old integrations keep working with no change.
--
-- Usage history IS relabelled to the new id here, which the 09-08 rename did
-- not do. That rename had only test traffic under the old id; this one has a
-- customer's whole history, and leaving it behind would split every per-model
-- report in the admin panel at the rename. Same pods, same weights, same
-- prices, so only the label moves — no charge is recomputed. To reverse:
--   update inference.usage set model_id = 'zhipu/glm-5.3-flash-uncensored'
--    where model_id = 'zhipu/glm-5.3-flash-derisked' and created_at < '2026-09-11';

begin;

-- ── Aliases ──────────────────────────────────────────────────────────────
-- Old ids that must keep resolving. Operator data: service-role only, like
-- the rest of the catalog's write side. RLS on with no policy denies anon and
-- authenticated outright; the gateway reads it with the service role.
create table if not exists inference.model_aliases (
  alias       text primary key,
  model_id    text not null references inference.models(model_id)
                on update cascade on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table inference.model_aliases is
  'Retired catalog ids that still resolve. The gateway maps alias -> model_id before routing, so a rename never breaks an integration.';

create index if not exists model_aliases_model_id_idx
  on inference.model_aliases (model_id);

alter table inference.model_aliases enable row level security;
revoke all on inference.model_aliases from anon, authenticated;

-- ── The rename ───────────────────────────────────────────────────────────
-- serving_endpoints and model_routes cascade on update (added 2026-09-08), so
-- both pods follow the id automatically.
update inference.models
   set model_id     = 'zhipu/glm-5.3-flash-derisked',
       display_name = 'Z.AI / GLM 5.3 Flash Derisked',
       description  = 'GLM 5.3 Flash by Z.AI, derisked, served on AhuraSense GPU pods.'
 where model_id = 'zhipu/glm-5.3-flash-uncensored';

insert into inference.model_aliases (alias, model_id, note)
values ('zhipu/glm-5.3-flash-uncensored', 'zhipu/glm-5.3-flash-derisked',
        'Renamed 2026-09-11. Was live with customer traffic, so the old id keeps resolving.')
on conflict (alias) do update set model_id = excluded.model_id, note = excluded.note;

update inference.usage
   set model_id = 'zhipu/glm-5.3-flash-derisked'
 where model_id = 'zhipu/glm-5.3-flash-uncensored';

commit;
