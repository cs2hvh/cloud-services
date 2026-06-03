'use client';

import { Check, CheckCheck, Loader2 } from 'lucide-react';
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

  const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold tracking-tight text-white">Notifications</h3>
          {unreadCount > 0 && (
            <span
              className={`${MONO} inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums`}
              style={{ background: 'rgba(0,149,255,0.15)', color: '#33adff' }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45 transition-colors hover:text-[#0095FF] disabled:opacity-50`}
          >
            {markingAll ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCheck className="h-3 w-3" />
            )}
            Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-h-[420px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:hover:bg-white/20">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.02] text-white/35">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-[13px] font-medium text-white/70">You&apos;re all caught up</p>
            <p className={`${MONO} mt-1 text-[10.5px] text-white/35`}>No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
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
    </div>
  );
}
