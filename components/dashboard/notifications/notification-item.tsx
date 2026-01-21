'use client';

import { formatDistanceToNow } from 'date-fns';
import { 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  XCircle,
  Circle 
} from 'lucide-react';
import { Notification, NotificationType } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

const iconMap: Record<NotificationType, React.ElementType> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const colorMap: Record<NotificationType, string> = {
  success: 'text-green-400',
  info: 'text-blue-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
};

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const Icon = iconMap[notification.type];
  const iconColor = colorMap[notification.type];

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 p-4 cursor-pointer transition-colors",
        notification.is_read 
          ? "bg-transparent hover:bg-slate-800/30" 
          : "bg-slate-800/50 hover:bg-slate-800/70"
      )}
    >
      {/* Unread indicator */}
      <div className="flex-shrink-0 mt-1">
        {!notification.is_read ? (
          <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
        ) : (
          <div className="h-2 w-2" />
        )}
      </div>

      {/* Icon */}
      <div className={cn("flex-shrink-0 mt-0.5", iconColor)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm",
          notification.is_read ? "text-slate-300" : "text-white font-medium"
        )}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          {new Date(notification.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })} at {new Date(notification.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })}
        </p>
      </div>
    </div>
  );
}
