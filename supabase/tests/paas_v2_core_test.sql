-- ============================================================================
-- Deploy v2 core schema — behavioural tests
--
-- Each test replays a CONFIRMED v1 defect against the v2 schema and asserts the
-- database refuses it. These are not hypotheticals: every "BLOCKED" line below
-- corresponds to a finding in docs/v2/01-discovery.md with file:line evidence.
--
-- Run inside a transaction; it rolls back and leaves nothing behind:
--   psql "$DATABASE_URL" -f supabase/tests/paas_v2_core_test.sql
-- ============================================================================

begin;
create temp table res(test text, outcome text);

do $$
declare
  v_user uuid; t1 uuid; t2 uuid; p1 uuid; p2 uuid; e1 uuid; d1 uuid; d2 uuid;
begin
  select id into v_user from auth.users limit 1;
  if v_user is null then
    raise exception 'no auth.users row to attach fixtures to';
  end if;

  insert into paas.teams(slug,name,created_by) values ('acme','Acme',v_user) returning id into t1;
  insert into paas.teams(slug,name,created_by) values ('evil','Evil',v_user) returning id into t2;
  insert into paas.projects(team_id,name,slug,provider,repo_id,repo_full_name)
    values (t1,'Site','site','github','1','acme/site') returning id into p1;
  insert into paas.projects(team_id,name,slug,provider,repo_id,repo_full_name)
    values (t2,'Bad','bad','github','2','evil/bad') returning id into p2;
  insert into paas.environments(project_id,kind,name) values (p1,'production','production') returning id into e1;

  -- v1 CRITICAL #1: branch was z.string().min(1) interpolated unquoted into
  -- `git clone --branch ${branch}` on an agent holding the cluster kubeconfig.
  begin
    insert into paas.projects(team_id,name,slug,provider,repo_id,repo_full_name,production_branch)
      values (t1,'X','xx','github','9','a/b','main;id');
    insert into res values ('branch injection "main;id"','FAIL - accepted');
  exception when check_violation then insert into res values ('branch injection "main;id"','BLOCKED'); end;

  begin
    insert into paas.deployments(project_id,environment_id,trigger,git_sha,git_ref)
      values (p1,e1,'git_push','abc1234','../../etc/passwd');
    insert into res values ('git_ref path traversal','FAIL - accepted');
  exception when check_violation then insert into res values ('git_ref path traversal','BLOCKED'); end;

  -- v1 CRITICAL #6/#10: `name` addressed all infrastructure and was mutable.
  begin
    update paas.projects set ref='prj_hijacked' where id=p1;
    insert into res values ('ref mutation','FAIL - accepted');
  exception when check_violation then insert into res values ('ref mutation','BLOCKED'); end;

  -- v1 CRITICAL #6: rename onto a victim's name, then redeploy over their workload.
  insert into paas.aliases(project_id,hostname,kind) values (p1,'site.apps.ahurasense.com','production');
  begin
    insert into paas.aliases(project_id,hostname,kind) values (p2,'site.apps.ahurasense.com','custom');
    insert into res values ('cross-tenant hostname takeover','FAIL - accepted');
  exception when unique_violation then insert into res values ('cross-tenant hostname takeover','BLOCKED'); end;

  begin
    insert into paas.aliases(project_id,hostname,kind) values (p1,'other.apps.ahurasense.com','production');
    insert into res values ('second production alias','FAIL - accepted');
  exception when unique_violation then insert into res values ('second production alias','BLOCKED'); end;

  -- v1 HIGH #6: a rollout that never completed was still reported SUCCESS,
  -- which finalized the release and switched on billing.
  begin
    insert into paas.deployments(project_id,environment_id,trigger,git_sha,git_ref,state)
      values (p1,e1,'git_push','abc1234','main','ready');
    insert into res values ('ready deployment with no image','FAIL - accepted');
  exception when check_violation then insert into res values ('ready deployment with no image','BLOCKED'); end;

  insert into paas.deployments(project_id,environment_id,trigger,git_sha,git_ref,state,image_repo,image_digest)
    values (p1,e1,'git_push','deadbee','main','publishing','r/x',
      'sha256:1111111111111111111111111111111111111111111111111111111111111111') returning id into d1;

  begin
    update paas.deployments set image_digest='sha256:2222222222222222222222222222222222222222222222222222222222222222' where id=d1;
    insert into res values ('image_digest rewrite','FAIL - accepted');
  exception when check_violation then insert into res values ('image_digest rewrite','BLOCKED'); end;

  -- v1 HIGH #7: two writers raced to finalize; the later one silently
  -- discarded the health verification the other had already performed.
  update paas.deployments set state='ready', ready_at=now() where id=d1;
  begin
    update paas.deployments set state='error' where id=d1;
    insert into res values ('overwrite terminal deployment','FAIL - accepted');
  exception when check_violation then insert into res values ('overwrite terminal deployment','BLOCKED'); end;

  -- The positive case: promotion and rollback are one UPDATE, no rebuild,
  -- no image retag. v1 rollback depended on a Docker Hub tag nothing pruned.
  insert into paas.deployments(project_id,environment_id,trigger,git_sha,git_ref,state,image_repo,image_digest)
    values (p1,e1,'git_push','cafe123','main','ready','r/x',
      'sha256:3333333333333333333333333333333333333333333333333333333333333333') returning id into d2;
  update paas.aliases set deployment_id=d2 where project_id=p1 and kind='production';
  update paas.aliases set deployment_id=d1 where project_id=p1 and kind='production';
  if (select deployment_id from paas.aliases where project_id=p1 and kind='production')=d1 then
    insert into res values ('promote + rollback via alias','WORKS (1 UPDATE, no rebuild)');
  else
    insert into res values ('promote + rollback via alias','FAIL');
  end if;

  -- v1 HIGH #4: layered shell+Groovy escaping bug on env var names.
  begin
    insert into paas.env_vars(project_id,key,value_ct,dek_id) values (p1,'FOO;rm -rf /','\x00','k1');
    insert into res values ('env var key injection','FAIL - accepted');
  exception when check_violation then insert into res values ('env var key injection','BLOCKED'); end;

  begin
    insert into paas.aliases(project_id,hostname,kind) values (p1,'BAD..Host','custom');
    insert into res values ('malformed hostname','FAIL - accepted');
  exception when check_violation then insert into res values ('malformed hostname','BLOCKED'); end;
end $$;

select test, outcome from res order by test;

-- Fail loudly in CI if anything regressed.
do $$
declare n int;
begin
  select count(*) into n from res where outcome like 'FAIL%';
  if n > 0 then
    raise exception '% schema guarantee(s) regressed', n;
  end if;
end $$;

rollback;
