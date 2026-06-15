/**
 * useRealtimeNotifications - Real-time notifications hook
 * 
 * Optimized notifications hook that uses the generic useRealtimeTable
 * 
 * Features:
 * - Real-time updates via Supabase Realtime
 * - Automatic unread count tracking
 * - Mark as read functionality
 * - Supabase client (no axios)
 * 
 * @example
 * const { notifications, unreadCount, markAsRead, markAllAsRead } = useRealtimeNotifications();
 */

import { useCallback, useMemo } from 'react';
import { useRealtimeTable } from './use-realtime-table';
import { createClient } from '@/lib/supabase/client';
import type { Notification, ServiceType, ActionType } from '@/lib/notifications/types';

interface NotificationRecord extends Record<string, unknown> {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  service_type: string;
  service_id: string | null;
  action: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface UseRealtimeNotificationsOptions {
  /** User ID to filter notifications */
  userId?: string;
  
  /** Maximum number of notifications to load (default: 50) */
  limit?: number;
  
  /** Enable/disable subscription (default: true) */
  enabled?: boolean;
}

interface UseRealtimeNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Transform database record to Notification type
 */
function transformNotification(record: NotificationRecord): Notification {
  return {
    id: record.id,
    user_id: record.user_id,
    type: record.type as 'success' | 'info' | 'warning' | 'error',
    title: record.title,
    message: record.message,
    service_type: record.service_type as ServiceType,
    service_id: record.service_id ?? undefined,
    action: record.action as ActionType,
    is_read: record.is_read,
    created_at: record.created_at,
    read_at: record.read_at ?? undefined,
    metadata: record.metadata ?? undefined,
  };
}

/**
 * Hook for real-time notifications with automatic unread count
 */
export function useRealtimeNotifications({
  userId,
  limit = 50,
  enabled = true,
}: UseRealtimeNotificationsOptions = {}): UseRealtimeNotificationsReturn {
  // Use generic realtime table hook
  const {
    data: notifications,
    loading,
    error,
    connectionStatus,
    refetch,
  } = useRealtimeTable<NotificationRecord, Notification>({
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    limit,
    enabled: enabled && !!userId,
    orderBy: 'created_at',
    orderDirection: 'desc',
    transform: transformNotification,
  });

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  // Mark single notification as read
  const markAsRead = useCallback(async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('[useRealtimeNotifications] Failed to mark as read:', error);
      throw error;
    }

    // Refetch immediately so badge clears even if realtime event is delayed.
    await refetch();
  }, [refetch]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[useRealtimeNotifications] Failed to mark all as read:', error);
      throw error;
    }

    // Refetch immediately so badge clears even if realtime event is delayed.
    await refetch();
  }, [userId, refetch]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    connectionStatus,
    markAsRead,
    markAllAsRead,
    refetch,
  };
}
