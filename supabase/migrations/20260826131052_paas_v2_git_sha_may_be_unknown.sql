-- git_sha was `not null` with check (git_sha ~ '^[0-9a-f]{7,40}$'), so a deploy
-- with no commit to record had to invent one. deploy.ts wrote '0000000' — seven
-- zeros, which satisfies the regex and is therefore indistinguishable from data.
--
-- The consequence surfaced in the UI: the promote picker labels options by short
-- sha, so six deployments rendered six identical "0000000" entries and a user
-- could not tell which build they were about to point a hostname at. An unusable
-- control that invites promoting the wrong build, produced by a schema rule
-- meant to guarantee data quality.
--
-- Null is honestly absent. A zero sha looks like data, and sorts and compares
-- like data.
alter table paas.deployments alter column git_sha drop not null;

alter table paas.deployments drop constraint if exists deployments_sha_shape;
alter table paas.deployments add constraint deployments_sha_shape
  check (git_sha is null or git_sha ~ '^[0-9a-f]{7,40}$');

comment on column paas.deployments.git_sha is
  'The commit this build actually built, or NULL when there is none to record. Never a placeholder: a fake sha is indistinguishable from a real one in any UI that shows it.';

-- NO BACKFILL. Nulling the existing '0000000' rows was attempted and
-- paas.tg_deployment_immutable() refused it — correctly. A migration that
-- rewrites what a past deploy recorded is exactly what that trigger exists to
-- stop, even when the rewrite is an improvement.
--
-- Those historical rows keep their placeholder permanently, so any UI showing a
-- sha must go on treating both null and an all-zero sha as absent. That is a
-- durable requirement, not a temporary shim.
