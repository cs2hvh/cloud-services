'use client';

import { Check, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationItem } from './notification-item';
import { useSession } from '@/app/dashboard/provider';
import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications';
import { useState } from 'react';

export function NotificationDropdown({ onClose }: { onClose?: () => void }) {
  const { user } = useSession();
  const [markingAll, setMarkingAll] = useState(false);
  
  // Use `onClose` optionally passed from parent (no-op here) to satisfy typings
  void onClose;

  // Use new realtime notifications hook
  const { 
    notifications, 
    loading,
    markAsRead,
    markAllAsRead,
  } = useRealtimeNotifications({
    userId: user?.id,
    limit: 20,
    enabled: !!user?.id,
  });

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id);
      // Realtime automatically updates the list
    } catch (error) {
      console.error('[NotificationDropdown] Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await markAllAsRead();
      // Realtime automatically updates the list
    } catch (error) {
      console.error('[NotificationDropdown] Failed to mark all as read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-white">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className="text-xs text-slate-400 hover:text-white"
          >
            {markingAll ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <CheckCheck className="h-3 w-3 mr-1" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Check className="h-8 w-8 mb-2" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {/* {notifications.length > 0 && (
        <div className="p-2 border-t border-slate-700">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-slate-400 hover:text-white"
            onClick={onClose}
          >
            View all notifications
          </Button>
        </div>
      )} */}
    </div>
  );
}
