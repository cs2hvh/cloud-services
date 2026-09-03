-- The PostgREST schema allow-list lives in a file now.
--
-- On 2026-08-26 it was edited in the dashboard and REPLACED rather than
-- appended: billing and inference went in, audits and support fell out. No
-- ticket could be created for three weeks, the audit log stopped, and the
-- activity feed rendered as "no activity". Nothing errored.
--
-- Stating the full list here makes the next change a reviewed diff instead of
-- a dashboard edit. This applies the value that is already live; it changes
-- nothing today. When a schema is added, add it HERE and re-apply.

alter role authenticator set pgrst.db_schemas = 'public,paas,billing,inference,audits,support';

-- PostgREST re-reads role settings on this signal.
notify pgrst, 'reload config';
