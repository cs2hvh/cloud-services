export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export type ServiceType =
  | 'platform_app'
  | 'database'
  | 'kubernetes'
  | 'object_storage'
  | 'network_ddos'
  | 'compute'
  | 'game_server'
  | 'firewall'
  | 'spectrum'
  | 'ai_agent'
  | 'knowledge_base'
  | 'domain'
  | 'billing'
  | 'inference';

export type ActionType = 
  | 'created' 
  | 'updated' 
  | 'deleted' 
  | 'deployed'
  | 'failed'
  | 'scaled'
  | 'restarted'
  | 'migrated'
  | 'resized'
  | 'attached'
  | 'detached';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  service_type: ServiceType;
  service_id?: string;
  action: ActionType;
  is_read: boolean;
  created_at: string;
  read_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateNotificationParams {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  service_type: ServiceType;
  service_id?: string;
  action: ActionType;
  metadata?: Record<string, unknown>;
}
