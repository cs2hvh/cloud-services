-- zhipu/glm-5.3-uncensored  ->  zhipu/glm-5.3-derisked
--
-- The full GLM 5.3 follows the flash model's naming: "Z.AI / GLM 5.3
-- Derisked". Same treatment as the 2026-09-11 rename, because this id has
-- real history behind it — 6,000-odd usage rows and a day that served 4,273
-- requests — so the old id stays resolvable through inference.model_aliases
-- and the usage rows follow the new id, keeping per-model reporting whole.
--
-- The pod behind it was rebuilt FP8 on vLLM and now answers to "glm5.3-R1"
-- on a new RunPod proxy hostname; that is endpoint data, already updated
-- with the service role, not here.
--
-- To reverse the usage relabel:
--   update inference.usage set model_id = 'zhipu/glm-5.3-uncensored'
--    where model_id = 'zhipu/glm-5.3-derisked' and created_at < '2026-09-15';

begin;

update inference.models
   set model_id     = 'zhipu/glm-5.3-derisked',
       display_name = 'Z.AI / GLM 5.3 Derisked',
       description  = 'GLM 5.3 by Z.AI, derisked, served on AhuraSense GPU pods.'
 where model_id = 'zhipu/glm-5.3-uncensored';

insert into inference.model_aliases (alias, model_id, note)
values ('zhipu/glm-5.3-uncensored', 'zhipu/glm-5.3-derisked',
        'Renamed 2026-09-15 to match the flash model. Was live, so the old id keeps resolving.')
on conflict (alias) do update set model_id = excluded.model_id, note = excluded.note;

update inference.usage
   set model_id = 'zhipu/glm-5.3-derisked'
 where model_id = 'zhipu/glm-5.3-uncensored';

commit;
