-- The audit log had no word for money or for reading.
--
-- Two CHECK constraints silently rejected whole classes of audit row:
--
--   service_type  kubernetes, database, network_ddos, platform_apps,
--                 object_storage, auth, git_webhook, ai_agent,
--                 knowledge_base, domain, compute
--   action        create, update, delete, login, logout
--
-- There is no 'billing' and no 'pricing', so a price change could not be
-- audited — the row was refused by the database. The admin panel's /pricing
-- page states "Writes go through billing.set_price() and are audited", and that
-- was untrue twice over: the audits schema was off PostgREST's exposed list
-- (fixed 2026-09-03), and even reachable, the row could not be written.
--
-- On 2026-09-02 three price changes were made — a GPU markup taken from 1.00x
-- to 10.00x, a Linode markup to 5x, and an 80% compute rate rise — and none
-- left an audit trail. Reconstructing who did what took reading created_by on
-- the price rows themselves, which only worked because service_pricing happens
-- to be append-only.
--
-- 'action' gains 'access' for the same reason in the other direction: reads of
-- customer data are the events most worth logging and least likely to leave any
-- other trace, and the constraint allowed only mutations.
--
-- Vocabulary chosen with the panel lane, matching what its routes actually
-- emit: pricing (4 routes), compute (8), billing (2), discount (2), gpu (2).

alter table audits.audit_logs drop constraint if exists audit_logs_service_type_check;

alter table audits.audit_logs add constraint audit_logs_service_type_check
  check (service_type = any (array[
    -- existing, preserved exactly
    'kubernetes', 'database', 'network_ddos', 'platform_apps', 'object_storage',
    'auth', 'git_webhook', 'ai_agent', 'knowledge_base', 'domain', 'compute',
    -- new: the money surfaces
    'billing', 'pricing', 'discount', 'gpu'
  ]));

alter table audits.audit_logs drop constraint if exists audit_logs_action_check;

alter table audits.audit_logs add constraint audit_logs_action_check
  check (action = any (array[
    -- existing, preserved exactly
    'create', 'update', 'delete', 'login', 'logout',
    -- new: reading customer data is an auditable act, not a non-event
    'access'
  ]));
