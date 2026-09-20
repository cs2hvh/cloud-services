-- Optional per-model fallback partner.
--
-- 2026-09-20, the same morning strict routing went live: the usage table
-- showed why the old chain existed. Over the previous 7 days one customer's
-- openai/gpt-6-astra traffic was answered by Starimg 87 times and rescued by
-- Wokey 173 times; zhipu/glm-5.3-flash 803 vs 138; openai/gpt-5.6-luna 47 vs
-- 37. Strict Starimg-only routing fails all of the rescued share.
--
-- So fallback stays OFF by default (null), which is what was asked for, and
-- is switched on per model, here or from the admin panel. The models with
-- observed rescues keep the second partner they had.

begin;

alter table inference.models
  add column if not exists fallback_provider inference.byok_provider;

comment on column inference.models.fallback_provider is
  'Second partner tried when upstream_provider fails, returns 5xx/429, says it lacks the model, or misses its first-byte deadline. Null (the default) means no fallback. Only starimg and wokey are meaningful.';

update inference.models
   set fallback_provider = 'wokey'
 where upstream_provider = 'starimg'
   and serving_type = 'proxy'
   and model_id in (
     'openai/gpt-6-astra',
     'zhipu/glm-5.3-flash',
     'openai/gpt-5.6-luna',
     'anthropic/claude-fable-5.1',
     'anthropic/claude-opus-5'
   );

commit;
