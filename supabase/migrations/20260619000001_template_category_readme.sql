-- Add category, readme, and active_project_count to templates
-- category mirrors Railway's taxonomy: AI/ML, Analytics, Automation, Blogs, Bots, CMS, Observability, Other, Starters, Storage
-- readme stores long-form markdown shown on the public /deploy/{slug} page
-- active_project_count is a cached counter updated by triggers for fast reads

alter table templates
  add column if not exists category text not null default 'Other'
    check (category in ('AI/ML', 'Analytics', 'Automation', 'Blogs', 'Bots', 'CMS', 'Observability', 'Other', 'Starters', 'Storage')),
  add column if not exists readme text not null default '';

create index if not exists idx_templates_category on templates(category);
create index if not exists idx_templates_category_visibility on templates(category, visibility);

-- Derive active_project_count from the stacks table on demand via a function
-- (avoids a denormalised counter that can drift out of sync)
create or replace function get_template_active_project_count(p_template_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from stacks
  where template_id = p_template_id
    and status not in ('deleted', 'failed');
$$;

grant execute on function get_template_active_project_count(uuid) to service_role, anon, authenticated;
