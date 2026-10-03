-- Deploy on push: whether a push to an app's production branch deploys it.
--
-- A deploy hook exists so a customer's CI can deploy only after their tests
-- pass. That only works if the push is not ALSO deploying: otherwise the push
-- goes to production before the tests run, and the hook deploys a second time
-- afterwards. Setting this false makes the hook (or the dashboard's Deploy
-- button) the only way to production.
--
-- DEFAULT TRUE, so every existing app behaves exactly as it did. Branch
-- previews are not governed by this column and keep deploying on push; the
-- rule lives in lib/paas/push-policy.ts, which all three git webhooks call.
--
-- No new grants: paas.projects carries table-level privileges for
-- `authenticated`, governed row by row by its existing RLS policies, the same
-- as scale_to_zero and the other settings the PATCH route writes.

alter table paas.projects
  add column if not exists deploy_on_push boolean not null default true;

comment on column paas.projects.deploy_on_push is
  'Whether a push to the production branch deploys. False routes production through a deploy hook or the dashboard. Previews are unaffected.';
