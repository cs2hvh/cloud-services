-- Harshit's call after seeing the rescue numbers (2026-09-20): keep Starimg,
-- strictly, and let the admin panel decide which models are shown at all.
-- The fallback_provider column stays for the panel to use; nothing is set.

begin;

update inference.models
   set upstream_provider = 'starimg'
 where model_id = 'openai/gpt-6-astra'
   and serving_type = 'proxy';

update inference.models
   set fallback_provider = null
 where fallback_provider is not null;

commit;
