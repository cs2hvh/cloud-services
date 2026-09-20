-- inference.usage.provider was text NOT NULL DEFAULT 'openrouter'.
--
-- Found 2026-09-20 by the admin-panel session. Since the gateway began
-- stamping the real partner (2026-09-18 12:07 UTC) the usage consumer has
-- written provider = null for anything no partner served: hosted-pod
-- requests, cache hits, errors before an upstream. NOT NULL rejected the
-- insert, the consumer retried the whole batch, and Cloudflare dropped it
-- after three attempts. Result: zero hosted-pod usage rows for two days
-- (16,362 in the three days before), plus every partner event that shared a
-- batch with one. Nothing in those rows was billed.
--
-- Null is the honest value for "no partner", so allow it and drop the
-- default that made old rows claim OpenRouter served them.

begin;

alter table inference.usage alter column provider drop not null;
alter table inference.usage alter column provider drop default;

comment on column inference.usage.provider is
  'Partner that answered a proxy request (starimg|wokey). Null = no partner: hosted pod, cache hit, or an error before any upstream. Rows before 2026-09-18 12:07 UTC carry the old default ''openrouter'' and say nothing about who served them.';

commit;
