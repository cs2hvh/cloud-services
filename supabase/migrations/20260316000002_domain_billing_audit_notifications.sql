-- Domain service observability support.
-- Enables "domain" in notification/audit service-type constraints.

alter table if exists notifications
  drop constraint if exists notifications_service_type_check;

alter table if exists notifications
  add constraint notifications_service_type_check
  check (service_type in (
    'platform_app',
    'database',
    'kubernetes',
    'object_storage',
    'network_ddos',
    'compute',
    'game_server',
    'firewall',
    'spectrum',
    'ai_agent',
    'knowledge_base',
    'domain'
  ));

-- New audit table location.
alter table if exists audits.audit_logs
  drop constraint if exists audit_logs_service_type_check;

alter table if exists audits.audit_logs
  add constraint audit_logs_service_type_check
  check (service_type in (
    'kubernetes',
    'database',
    'network_ddos',
    'platform_apps',
    'object_storage',
    'auth',
    'git_webhook',
    'ai_agent',
    'knowledge_base',
    'domain'
  ));

-- Legacy audit table location used by older environments.
alter table if exists public.audit_logs
  drop constraint if exists audit_logs_service_type_check;

alter table if exists public.audit_logs
  add constraint audit_logs_service_type_check
  check (service_type in (
    'kubernetes',
    'database',
    'network_ddos',
    'platform_apps',
    'object_storage',
    'auth',
    'git_webhook',
    'ai_agent',
    'knowledge_base',
    'domain'
  ));
