-- Enable "compute" in the audit-log service-type constraint (Linode resell
-- admin actions + destructive user ops audit under service_type='compute').
-- notifications_service_type_check already includes 'compute'.

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
    'domain',
    'compute'
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
    'domain',
    'compute'
  ));
