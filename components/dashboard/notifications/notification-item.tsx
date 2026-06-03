'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Notification, NotificationType } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';

const iconMap: Record<NotificationType, React.ElementType> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

// Single accent per type → icon color + tinted chip (bg 10%, border 20%).
const TONE: Record<NotificationType, string> = {
  success: '#4ade80',
  info: '#0095FF',
  warning: '#fbbf24',
  error: '#f87171',
};

function formatTimestamp(date: Date): string {
  return `${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}, ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
}

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const Icon = iconMap[notification.type] ?? Info;
  const tone = TONE[notification.type] ?? TONE.info;
  const isUnread = !notification.is_read;
  const createdAt = new Date(notification.created_at);

  const handleClick = () => {
    if (isUnread) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors',
        isUnread ? 'bg-[#0095FF]/[0.04] hover:bg-[#0095FF]/[0.07]' : 'hover:bg-white/[0.03]'
      )}
    >
      {/* Unread accent bar */}
      {isUnread && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[2px]"
          style={{ background: '#0095FF', boxShadow: '0 0 8px rgba(0,149,255,0.5)' }}
        />
      )}

      {/* Icon */}
      <div className="mt-0.5 shrink-0" style={{ color: tone }}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-[13px]',
              isUnread ? 'font-medium text-white' : 'text-white/75'
            )}
          >
            {notification.title}
          </p>
          {isUnread && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: '#0095FF', boxShadow: '0 0 6px rgba(0,149,255,0.7)' }}
            />
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-white/45">
          {notification.message}
        </p>
        <p className={`${MONO} mt-1.5 text-[10px] uppercase tracking-[0.06em] text-white/30 tabular-nums`}>
          {formatDistanceToNow(createdAt, { addSuffix: true })}
          <span className="mx-1.5 text-white/15">·</span>
          {formatTimestamp(createdAt)}
        </p>
      </div>
    </div>
  );
}
