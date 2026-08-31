-- `paas.installations` had a SELECT policy and nothing else, so a user could
-- SEE their GitHub connections but never CREATE one. Connecting GitHub was
-- therefore impossible from the product — the only rows that existed were
-- written by installations-sync.ts with the service role.
--
-- Same shape as the team bootstrap gap: the schema was written for reconcilers
-- to write and users to read, and the self-service path was never expressed.
--
-- SCOPED TO ADMINS OF THE TEAM BEING WRITTEN TO. `with check` is the half that
-- matters on an INSERT: `using` governs which existing rows you may touch, and
-- an INSERT has none, so a policy with only `using` would let a caller insert a
-- row naming ANY team_id. That would hand a stranger's team deploy access to
-- the caller's repositories — or attach the caller's installation to a team
-- they do not control and let that team mint tokens for it.
--
-- UPDATE and DELETE are deliberately NOT granted. Repointing an installation to
-- another team is a takeover, and soft-deleting one is how a connection
-- silently stops working; both stay with the reconciler where they are
-- auditable.
--
-- The unique constraint on installation_id still does the real refusal when
-- another team already holds an installation — a unique violation is raised
-- regardless of RLS, which is what turns that case into a clean 409 rather than
-- a silent success against a row the caller cannot see.

create policy installations_connect
  on paas.installations
  for insert
  to authenticated
  with check (paas.has_team_access(team_id, 'admin'::paas.team_role));

comment on policy installations_connect on paas.installations is
  'A team admin may connect a GitHub installation to their OWN team. No UPDATE or DELETE: repointing an installation to another team is a takeover, and soft-deleting one silently breaks deploys — both belong to the reconciler.';
