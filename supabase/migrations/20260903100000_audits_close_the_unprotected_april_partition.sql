-- Close the one audit partition that has row-level security switched off.
--
-- WHY THIS IS URGENT RATHER THAN TIDY
--
-- `authenticated` holds SELECT on audits.audit_logs. Every partition has RLS
-- enabled with ZERO policies, which is deny-all and therefore safe — except
-- audit_logs_2026_04, where RLS is off. 986 rows.
--
-- Those rows carry user_email, ip_address, user_agent and before/after state
-- for admin actions taken on other customers.
--
-- Nothing is exposed TODAY only because the `audits` schema fell off
-- PostgREST's exposed-schemas list (probably when billing and inference were
-- added on 2026-08-26 — the list was replaced rather than appended, which is
-- also why the audit trail has been silently dead since that date, with writes
-- failing PGRST106). So a configuration accident is currently the only thing
-- standing between a logged-in customer and those 986 rows.
--
-- That matters because the fix for the dead audit trail is to put `audits` back
-- on the exposed-schemas list — which REMOVES the accident that is protecting
-- this partition. Re-exposing first would open the hole. Hence this lands
-- first, and the dashboard change second.
--
-- WHY DENY-ALL IS THE RIGHT POLICY SET
--
-- No policies are added, deliberately. Every reader of this table in the
-- application goes through createServiceClient (lib/audit/service.ts,
-- lib/supabase/queries/audit_logs.ts), and service_role bypasses RLS — the
-- customer-facing activity feed included, which filters by user_id in its
-- query rather than relying on RLS. The admin panel's reads are service_role
-- too. So deny-all for `authenticated` breaks no reader that exists, and
-- matches what the other eleven partitions already do.
--
-- Adding a permissive policy here would be inventing an access path nothing
-- asks for. If a customer-facing reader ever needs direct access, it should
-- arrive with its own policy and its own reasoning.

alter table audits.audit_logs_2026_04 enable row level security;

comment on table audits.audit_logs_2026_04 is
  'RLS enabled 2026-09-03 with no policies (deny-all for authenticated), '
  'matching every sibling partition. It was the only one left open, and the '
  'audits schema being off PostgREST''s list was the only thing hiding it.';
