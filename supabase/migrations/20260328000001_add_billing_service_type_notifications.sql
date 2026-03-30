-- Add billing as supported notifications service_type.

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
    'domain',
    'billing'
  ));

comment on constraint notifications_service_type_check on notifications is
  'Supported notification service types including billing events.';
