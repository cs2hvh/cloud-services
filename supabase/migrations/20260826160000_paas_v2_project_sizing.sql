-- Instance sizing on the project.
--
-- Until now every app got replicas:1 and 100m/256Mi regardless of what it was
-- sold, because the reconciler never passed sizing to the manifest generator.
-- The tiers existed only in a pricing document: a customer paying $39 for 4 GB
-- received identical resources to one paying $5 for 512 MB, and nothing
-- anywhere would have reported that.
--
-- Sizing lives on the PROJECT rather than the deployment because it is a
-- property of the app, not of a build. Changing size is a resize, not a new
-- release, and a rollback to last week's deployment must not silently roll the
-- customer back to last week's plan.
alter table paas.projects
  add column if not exists tier text not null default 'starter',
  add column if not exists instance_count integer not null default 1;

-- The tier ids are a closed set defined in lib/paas/tiers.ts. Constraining them
-- here means a typo cannot reach a manifest: without this an unknown tier would
-- be stored happily and fail later, at deploy time, on an app already paid for.
alter table paas.projects drop constraint if exists projects_tier_known;
alter table paas.projects add constraint projects_tier_known
  check (tier in ('starter', 'basic', 'standard', 'plus', 'pro', 'pro-plus'));

-- Bounded because placement reads pod_allocated against the LKE pod ceiling
-- (1,000 standard / 5,000 enterprise). One customer must not be able to consume
-- a cluster's headroom from a dropdown.
alter table paas.projects drop constraint if exists projects_instance_count_bounded;
alter table paas.projects add constraint projects_instance_count_bounded
  check (instance_count >= 1 and instance_count <= 10);

comment on column paas.projects.tier is
  'Instance size id. Closed set, mirrored in lib/paas/tiers.ts and asserted against docs/v2/05-pricing.md by tiers.test.ts.';
comment on column paas.projects.instance_count is
  'Horizontal scale. Price is LINEAR in this number; bundled transfer is not, because it is allotted per app rather than per instance.';
