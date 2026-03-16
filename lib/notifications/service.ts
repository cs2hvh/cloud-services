import { createServiceClient } from "@/lib/supabase/server";
import { CreateNotificationParams, Notification, ServiceType, ActionType, NotificationType } from "./types";

export const NotificationService = {
  /**
   * Create a new notification
   */
  async create(params: CreateNotificationParams): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("notifications")
        .insert(params)
        .select("id")
        .single();

      if (error) {
        console.error(`[NotificationService.create] Error: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, id: data.id };
    } catch (err) {
      console.error(`[NotificationService.create] Error: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get notifications for a user with pagination
   */
  async getByUserId(userId: string, options?: { 
    limit?: number; 
    offset?: number; 
    unreadOnly?: boolean 
  }): Promise<Notification[]> {
    const { limit = 20, offset = 0, unreadOnly = false } = options || {};
    try {
      const supabase = await createServiceClient();
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.eq("is_read", false);
      }

      const { data, error } = await query;
      if (error) {
        console.error(`[NotificationService.getByUserId] Error: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[NotificationService.getByUserId] Error: ${err}`);
      return [];
    }
  },

  /**
   * Get count of unread notifications
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) return 0;
      return count || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("user_id", userId);

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOlderThan(days: number = 30): Promise<number> {
    try {
      const supabase = await createServiceClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from("notifications")
        .delete()
        .lt("created_at", cutoffDate.toISOString())
        .select("id");

      if (error) return 0;
      return data?.length || 0;
    } catch {
      return 0;
    }
  }
};

/**
 * Helper function for creating consistent service notifications
 */
export function createServiceNotification(params: {
  userId: string;
  serviceType: ServiceType;
  action: ActionType;
  serviceName: string;
  serviceId?: string;
  type?: NotificationType;
  error?: string;
  metadata?: Record<string, unknown>;
}): CreateNotificationParams {
  const { userId, serviceType, action, serviceName, serviceId, type: overrideType, error, metadata } = params;
  
  const actionMessages: Record<ActionType, { type: NotificationType; verb: string }> = {
    created: { type: 'success', verb: 'created' },
    updated: { type: 'info', verb: 'updated' },
    deleted: { type: 'warning', verb: 'deleted' },
    deployed: { type: 'success', verb: 'deployed' },
    failed: { type: 'error', verb: 'failed' },
    scaled: { type: 'info', verb: 'scaled' },
    restarted: { type: 'info', verb: 'restarted' },
    migrated: { type: 'success', verb: 'migrated' },
    resized: { type: 'info', verb: 'resized' },
    attached: { type: 'info', verb: 'attached' },
    detached: { type: 'info', verb: 'detached' },
  };

  const serviceLabels: Record<ServiceType, string> = {
    platform_app: 'Application',
    database: 'Database',
    kubernetes: 'Kubernetes Cluster',
    object_storage: 'Storage Bucket',
    network_ddos: 'DDoS Protection',
    compute: 'Compute Instance',
    game_server: 'Game Server',
    firewall: 'Firewall Rule',
    spectrum: 'Spectrum App',
    ai_agent: 'AI Agent',
    knowledge_base: 'Knowledge Base',
    domain: 'Domain',
  };

  const { type: defaultType, verb } = actionMessages[action];
  const serviceLabel = serviceLabels[serviceType];
  const notificationType = overrideType || (error ? 'error' : defaultType);

  // Generate detailed message for updates
  let message: string;
  
  if (error) {
    message = `Failed to ${verb} ${serviceLabel.toLowerCase()} "${serviceName}": ${error}`;
  } else if (action === 'updated' && metadata?.updateType) {
    // Create specific update messages based on updateType
    const updateType = metadata.updateType as string;
    
    switch (updateType) {
      case 'storage':
        message = `${serviceLabel} "${serviceName}" storage has been upgraded${metadata.newSize ? ` to ${metadata.newSize}` : ''}.`;
        break;
      case 'storage_upsize':
        message = `${serviceLabel} "${serviceName}" storage has been upsized to ${metadata.newStorageGiB} GiB.`;
        break;
      case 'region':
        message = `${serviceLabel} "${serviceName}" is being migrated to region: ${metadata.newRegion || 'new region'}.`;
        break;
      case 'maintenance':
        message = `${serviceLabel} "${serviceName}" maintenance window updated to ${metadata.day} at ${metadata.hour}.`;
        break;
      case 'project':
        message = `${serviceLabel} "${serviceName}" has been moved to project${metadata.projectName ? `: ${metadata.projectName}` : ''}.`;
        break;
      case 'user_created':
        message = `Database user "${metadata.userName}" has been created for ${serviceName}.`;
        break;
      case 'user_deleted':
        message = `Database user "${metadata.userName}" has been deleted from ${serviceName}.`;
        break;
      case 'database_created':
        message = `Database "${metadata.dbName}" has been created in cluster ${serviceName}.`;
        break;
      case 'database_deleted':
        message = `Database "${metadata.dbName}" has been deleted from cluster ${serviceName}.`;
        break;
      case 'firewall':
        message = `Firewall rule added for ${serviceName}: ${metadata.ipAddress}`;
        break;
      case 'firewall_deleted':
        message = `Firewall rule removed from ${serviceName}: ${metadata.ipAddress}`;
        break;
      case 'bucket_project':
        message = `${serviceLabel} "${serviceName}" project assignment updated.`;
        break;
      case 'bucket_acl':
        message = `${serviceLabel} "${serviceName}" ACL updated to "${metadata.acl}".`;
        break;
      case 'bucket_cors':
        message = `${serviceLabel} "${serviceName}" CORS ${metadata.enabled ? 'enabled' : 'disabled'}.`;
        break;
      case 'bucket_versioning':
        message = `${serviceLabel} "${serviceName}" versioning ${metadata.enabled ? 'enabled' : 'disabled'}.`;
        break;
      case 'agent_model':
        message = `${serviceLabel} "${serviceName}" model updated to ${metadata.modelId}.`;
        break;
      case 'agent_system_prompt':
        message = `${serviceLabel} "${serviceName}" system prompt has been updated.`;
        break;
      case 'agent_settings':
        message = `${serviceLabel} "${serviceName}" settings have been updated.`;
        break;
      case 'agent_rag':
        message = `${serviceLabel} "${serviceName}" RAG settings ${metadata.enabled ? 'enabled' : 'updated'}.`;
        break;
      case 'agent_status':
        message = `${serviceLabel} "${serviceName}" status changed to ${metadata.status}.`;
        break;
      case 'kb_attached':
        message = `Knowledge Base "${metadata.kbName}" attached to ${serviceName}.`;
        break;
      case 'kb_detached':
        message = `Knowledge Base "${metadata.kbName}" detached from ${serviceName}.`;
        break;
      case 'kb_documents':
        message = `${metadata.count} document(s) ${metadata.action} in "${serviceName}".`;
        break;
      case 'kb_settings':
        message = `${serviceLabel} "${serviceName}" settings have been updated.`;
        break;
      default:
        message = `${serviceLabel} "${serviceName}" has been ${verb} successfully.`;
    }
  } else if (action === 'attached') {
    message = `${serviceLabel} "${serviceName}" has been attached${metadata?.targetName ? ` to ${metadata.targetName}` : ''}.`;
  } else if (action === 'detached') {
    message = `${serviceLabel} "${serviceName}" has been detached${metadata?.targetName ? ` from ${metadata.targetName}` : ''}.`;
  } else {
    message = `${serviceLabel} "${serviceName}" has been ${verb} successfully.`;
  }

  return {
    user_id: userId,
    type: notificationType,
    title: `${serviceLabel} ${verb.charAt(0).toUpperCase() + verb.slice(1)}`,
    message,
    service_type: serviceType,
    service_id: serviceId,
    action,
    metadata: { ...metadata, serviceName, error },
  };
}
