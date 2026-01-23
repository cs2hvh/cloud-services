// ============================================
// AUDIT LOG TYPES
// ============================================

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout';

export type AuditServiceType = 
  | 'kubernetes' 
  | 'database' 
  | 'network_ddos' 
  | 'platform_apps' 
  | 'object_storage'
  | 'auth';

export type AuditUserRole = 'user' | 'admin' | 'system';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_role: AuditUserRole;
  user_email?: string;
  user_username?: string;
  
  action: AuditAction;
  service_type: AuditServiceType;
  service_id: string;
  service_name?: string;
  
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  
  metadata?: Record<string, unknown>;
  checksum?: string;
  created_at: string;
  created_date?: string;
}

export interface AuditLogFilters {
  user_id?: string;
  service_type?: AuditServiceType;
  action?: AuditAction;
  service_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
}

export interface CreateAuditLogParams {
  user_id: string;
  user_role: AuditUserRole;
  user_email?: string;
  user_username?: string;
  
  action: AuditAction;
  service_type: AuditServiceType;
  service_id?: string;
  service_name?: string;
  
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  
  metadata?: Record<string, unknown>;
}

export interface AuditContext {
  ipAddress: string;
  userAgent: string;
  requestId: string;
}
